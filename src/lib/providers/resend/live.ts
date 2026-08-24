/**
 * Adapter live Resend — integrazione server-side con idempotency e webhook Svix.
 */

import { Resend } from 'resend';
import { Webhook } from 'svix';
import type { OutboundEmail, ResendProvider, ResendWebhookEvent, SendResult } from './types';

export interface ResendLiveConfig {
  apiKey: string;
  webhookSecret?: string;
}

const EVENT_MAP: Record<string, ResendWebhookEvent['type']> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
};

export class ResendLive implements ResendProvider {
  private readonly client: Resend;
  private readonly config: ResendLiveConfig;

  constructor(config: ResendLiveConfig) {
    if (!config.apiKey) {
      throw new Error(
        'ResendLive: credenziali mancanti — configurare RESEND_API_KEY oppure usare RESEND_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
    this.client = new Resend(config.apiKey);
  }

  async send(message: OutboundEmail): Promise<SendResult> {
    const headers: Record<string, string> = { ...(message.headers ?? {}) };
    if (message.idempotencyKey) {
      headers['Idempotency-Key'] = message.idempotencyKey;
    }

    const result = await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html ?? message.text ?? '',
      text: message.text,
      headers,
      replyTo: message.headers?.['Reply-To'],
    });

    if (result.error) {
      throw new Error(`ResendLive.send: ${result.error.message}`);
    }

    return {
      providerMessageId: result.data?.id ?? 'unknown',
      sentAt: new Date().toISOString(),
    };
  }

  parseWebhookEvent(rawBody: string, signature: string | null): ResendWebhookEvent {
    if (!this.config.webhookSecret) {
      throw new Error('ResendLive.parseWebhookEvent: RESEND_WEBHOOK_SECRET mancante');
    }
    if (!signature) {
      throw new Error('ResendLive.parseWebhookEvent: header Svix mancanti (JSON)');
    }

    let headers: Record<string, string>;
    try {
      headers = JSON.parse(signature) as Record<string, string>;
    } catch {
      throw new Error('ResendLive.parseWebhookEvent: passare header Svix serializzati in JSON');
    }

    const wh = new Webhook(this.config.webhookSecret);
    const payload = wh.verify(rawBody, headers) as {
      type?: string;
      data?: { email_id?: string; to?: string[]; created_at?: string };
      created_at?: string;
    };

    const typeKey = payload.type ?? '';
    const mapped = EVENT_MAP[typeKey];
    if (!mapped) {
      throw new Error(`ResendLive.parseWebhookEvent: evento non supportato ${typeKey}`);
    }

    const providerMessageId = payload.data?.email_id ?? 'unknown';
    const recipient = payload.data?.to?.[0] ?? '';

    return {
      providerEventId: `${typeKey}:${providerMessageId}:${payload.created_at ?? Date.now()}`,
      type: mapped,
      providerMessageId,
      recipient,
      occurredAt: payload.created_at ?? new Date().toISOString(),
      payload: payload as Record<string, unknown>,
    };
  }
}
