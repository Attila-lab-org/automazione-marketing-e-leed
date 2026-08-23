/**
 * Adapter live Resend — STUB Phase 1.
 *
 * L'integrazione reale (SDK Resend, svix signature verify) arriva con la fase
 * Messaging (§23 Phase 6). Senza credenziali lo stub fallisce con errore chiaro.
 * Le API key restano solo server-side (§11.2, §18).
 */

import type { OutboundEmail, ResendProvider, ResendWebhookEvent, SendResult } from './types';

export interface ResendLiveConfig {
  apiKey: string;
  webhookSecret?: string;
}

export class ResendLive implements ResendProvider {
  private readonly config: ResendLiveConfig;

  constructor(config: ResendLiveConfig) {
    if (!config.apiKey) {
      throw new Error(
        'ResendLive: credenziali mancanti — configurare RESEND_API_KEY oppure usare RESEND_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
  }

  async send(_message: OutboundEmail): Promise<SendResult> {
    void this.config;
    throw new Error('ResendLive.send non implementato in Phase 1: usare mock mode');
  }

  parseWebhookEvent(_rawBody: string, _signature: string | null): ResendWebhookEvent {
    throw new Error('ResendLive.parseWebhookEvent non implementato in Phase 1: usare mock mode');
  }
}
