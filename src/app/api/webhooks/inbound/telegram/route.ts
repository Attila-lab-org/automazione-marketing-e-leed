import { NextResponse } from 'next/server';
import { processTelegramInbound } from '@/lib/inbound/process';
import { getTelegramInboundSettings } from '@/lib/inbound/telegram-settings';
import { getTelegramProvider } from '@/lib/providers/telegram';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

/**
 * Webhook pubblico Telegram.
 * Header richiesto in live: X-Telegram-Bot-Api-Secret-Token
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const settings = await getTelegramInboundSettings(admin, workspace.id);
  if (!settings.enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'TELEGRAM_DISABLED' });
  }

  const rawBody = await request.text();
  let provider;
  try {
    provider = getTelegramProvider(process.env);
    provider.verifyWebhook({ rawBody, headers: request.headers, env: process.env });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook non valido' },
      { status: 401 },
    );
  }

  const message = provider.parseInbound(rawBody);
  if (!message) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'NOT_ACTIONABLE' });
  }

  try {
    const result = await processTelegramInbound({
      admin,
      workspaceId: workspace.id,
      message,
      provider,
      settings,
      env: process.env,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('telegram inbound failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Elaborazione fallita' },
      { status: 500 },
    );
  }
}

export async function GET() {
  let enabled = false;
  if (isSupabaseConfigured(process.env) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    enabled = (await getTelegramInboundSettings(admin, workspace.id)).enabled;
  }
  return NextResponse.json({
    channel: 'telegram',
    enabled,
    mode: (process.env.TELEGRAM_PROVIDER_MODE ?? 'mock').toLowerCase(),
  });
}
