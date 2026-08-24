import { NextResponse } from 'next/server';
import { processTelegramInbound } from '@/lib/inbound/process';
import {
  getTelegramProvider,
  isTelegramEnabled,
} from '@/lib/providers/telegram';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

/**
 * Webhook pubblico Telegram.
 * Header richiesto in live: X-Telegram-Bot-Api-Secret-Token
 */
export async function POST(request: Request) {
  if (!isTelegramEnabled(process.env)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'TELEGRAM_DISABLED' });
  }

  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
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
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    const result = await processTelegramInbound({
      admin,
      workspaceId: workspace.id,
      message,
      provider,
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
  return NextResponse.json({
    channel: 'telegram',
    enabled: isTelegramEnabled(process.env),
    mode: (process.env.TELEGRAM_PROVIDER_MODE ?? 'mock').toLowerCase(),
  });
}
