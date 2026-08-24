function telegramApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function resolveTelegramWebhookUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    env.VERCEL_URL?.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const origin = new URL(withProtocol).origin;
    if (
      (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') &&
      /localhost|127\.0\.0\.1/.test(origin)
    ) {
      return null;
    }
    return `${origin}/api/webhooks/inbound/telegram`;
  } catch {
    return null;
  }
}

export function getTelegramCredentialStatus(
  env: NodeJS.ProcessEnv = process.env,
): {
  mode: string;
  ready: boolean;
  missing: string[];
  webhookUrl: string | null;
} {
  const mode = (env.TELEGRAM_PROVIDER_MODE ?? 'mock').toLowerCase();
  const missing: string[] = [];
  if (mode !== 'live') missing.push('TELEGRAM_PROVIDER_MODE=live');
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) missing.push('TELEGRAM_BOT_TOKEN');
  if (!env.TELEGRAM_WEBHOOK_SECRET?.trim()) missing.push('TELEGRAM_WEBHOOK_SECRET');
  const webhookUrl = resolveTelegramWebhookUrl(env);
  if (!webhookUrl) missing.push('NEXT_PUBLIC_APP_URL');
  return { mode, ready: missing.length === 0, missing, webhookUrl };
}

async function telegramWebhookCall(
  method: 'setWebhook' | 'deleteWebhook',
  body: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN mancante');
  const response = await fetch(telegramApiUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    ok?: boolean;
    description?: string;
  };
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram ${method}: errore ${response.status}`);
  }
}

export async function registerTelegramWebhook(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const status = getTelegramCredentialStatus(env);
  if (!status.ready || !status.webhookUrl) {
    throw new Error(`Configurazione Telegram incompleta: ${status.missing.join(', ')}`);
  }
  await telegramWebhookCall(
    'setWebhook',
    {
      url: status.webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false,
    },
    env,
  );
  return status.webhookUrl;
}

export async function unregisterTelegramWebhook(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) return;
  await telegramWebhookCall('deleteWebhook', { drop_pending_updates: false }, env);
}
