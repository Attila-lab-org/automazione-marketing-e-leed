import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import {
  getTelegramInboundSettings,
  normalizeTelegramSettings,
  resolveTelegramOperationalMode,
  saveTelegramInboundSettings,
} from '@/lib/inbound/telegram-settings';
import {
  getTelegramCredentialStatus,
  registerTelegramWebhook,
  unregisterTelegramWebhook,
} from '@/lib/providers/telegram/webhook';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function unavailable() {
  return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
}

async function loadTelegramStats(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  workspaceId: string,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [sentRes, draftsRes, errorsRes, urgentRes] = await Promise.all([
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('provider', 'telegram')
      .eq('direction', 'OUTBOUND')
      .gte('created_at', since),
    admin
      .from('message_threads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('channel', 'TELEGRAM')
      .or('assigned_mode.eq.HUMAN,status.eq.NEEDS_REPLY'),
    admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'TELEGRAM_REPLY_FAILED')
      .gte('occurred_at', since),
    admin
      .from('message_threads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('channel', 'TELEGRAM')
      .eq('priority', 'HOT'),
  ]);
  return {
    sent24h: sentRes.count ?? 0,
    draftsPending: draftsRes.count ?? 0,
    errors24h: errorsRes.count ?? 0,
    urgent: urgentRes.count ?? 0,
  };
}

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return unavailable();
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const settings = await getTelegramInboundSettings(admin, workspace.id);
  const connection = getTelegramCredentialStatus(process.env);
  const stats = await loadTelegramStats(admin, workspace.id);
  return NextResponse.json({
    settings,
    connection,
    operationalMode: resolveTelegramOperationalMode(settings),
    stats,
  });
});

export const PATCH = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return unavailable();
  }
  const body = (await request.json()) as Record<string, unknown>;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const current = await getTelegramInboundSettings(admin, workspace.id);
  const next = normalizeTelegramSettings({
    ...current,
    ...body,
    // L'avvio/arresto passa solo dalla POST, così il webhook viene registrato.
    enabled: current.enabled,
  });
  if (!next.replyTemplate.trim()) {
    return NextResponse.json({ error: 'Scrivi una risposta automatica' }, { status: 400 });
  }
  const settings = await saveTelegramInboundSettings(admin, workspace.id, next);
  const stats = await loadTelegramStats(admin, workspace.id);
  return NextResponse.json({
    settings,
    operationalMode: resolveTelegramOperationalMode(settings),
    stats,
    message: 'Impostazioni Telegram salvate',
  });
});

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return unavailable();
  }
  const body = (await request.json()) as { action?: 'start' | 'stop' };
  if (body.action !== 'start' && body.action !== 'stop') {
    return NextResponse.json({ error: 'Azione start o stop obbligatoria' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const current = await getTelegramInboundSettings(admin, workspace.id);
  let warning: string | null = null;
  let webhookUrl: string | null = null;

  if (body.action === 'start') {
    webhookUrl = await registerTelegramWebhook(process.env);
  } else {
    try {
      await unregisterTelegramWebhook(process.env);
    } catch (error) {
      warning =
        error instanceof Error
          ? `Bot fermato nell'app, ma Telegram non ha confermato: ${error.message}`
          : 'Bot fermato nell’app, ma Telegram non ha confermato';
    }
  }

  const settings = await saveTelegramInboundSettings(admin, workspace.id, {
    ...current,
    enabled: body.action === 'start',
  });

  await admin.from('activity_log').insert({
    workspace_id: workspace.id,
    actor_type: 'SYSTEM',
    entity_type: 'workspace',
    entity_id: workspace.id,
    category: 'DECISION',
    event_type:
      body.action === 'start' ? 'TELEGRAM_INBOUND_STARTED' : 'TELEGRAM_INBOUND_STOPPED',
    message:
      body.action === 'start'
        ? 'Monitoraggio Telegram avviato dalla dashboard'
        : 'Monitoraggio Telegram fermato dalla dashboard',
    data: { webhook_url: webhookUrl, warning },
  });

  const stats = await loadTelegramStats(admin, workspace.id);
  return NextResponse.json({
    settings,
    connection: getTelegramCredentialStatus(process.env),
    operationalMode: resolveTelegramOperationalMode(settings),
    stats,
    warning,
    message:
      body.action === 'start'
        ? 'Telegram è in automatico protetto'
        : 'Telegram è fermo',
  });
});
