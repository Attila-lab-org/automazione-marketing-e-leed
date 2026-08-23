/**
 * Factory ResendProvider — selezione via env RESEND_PROVIDER_MODE (mock|live),
 * default mock: mai email reali senza configurazione esplicita (§23.1).
 */

import { ResendLive } from './live';
import { ResendMock } from './mock';
import type { ResendProvider } from './types';

export type { OutboundEmail, ResendProvider, ResendWebhookEvent, SendResult } from './types';
export { ResendMock } from './mock';
export { ResendLive } from './live';

export function getResendProvider(env: NodeJS.ProcessEnv = process.env): ResendProvider {
  const mode = (env.RESEND_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live') {
    return new ResendLive({
      apiKey: env.RESEND_API_KEY ?? '',
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
  }
  if (mode !== 'mock') {
    throw new Error(`RESEND_PROVIDER_MODE "${mode}" non valido: atteso mock|live`);
  }
  return new ResendMock();
}
