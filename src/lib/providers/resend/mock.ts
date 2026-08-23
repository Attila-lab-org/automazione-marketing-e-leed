/**
 * Mock Resend — MAI email reali (§23.1).
 *
 * - Registra i send in memoria (ispezionabile nei test).
 * - Simula eventi webhook in modo deterministico via simulateEvent().
 * - Nessuna chiamata di rete.
 */

import { stableHash } from '../google-places/mock';
import type { MessageEventType } from '../../types/domain';
import type { OutboundEmail, ResendProvider, ResendWebhookEvent, SendResult } from './types';

export class ResendMock implements ResendProvider {
  /** Registro dei send simulati (mai rete). */
  readonly sentMessages: Array<OutboundEmail & { providerMessageId: string; sentAt: string }> = [];
  private counter = 0;

  async send(message: OutboundEmail): Promise<SendResult> {
    if (!message.to.includes('@')) {
      throw new Error(`ResendMock: destinatario invalido "${message.to}"`);
    }
    this.counter += 1;
    const providerMessageId =
      message.idempotencyKey != null
        ? `mock-msg-${stableHash(message.idempotencyKey).toString(36)}`
        : `mock-msg-${this.counter.toString(36)}-${stableHash(message.to).toString(36)}`;

    // Idempotenza: stesso idempotencyKey → stesso providerMessageId, no doppio send.
    const existing = this.sentMessages.find((m) => m.providerMessageId === providerMessageId);
    if (existing) {
      return { providerMessageId, sentAt: existing.sentAt };
    }

    const record = { ...message, providerMessageId, sentAt: new Date().toISOString() };
    this.sentMessages.push(record);
    return { providerMessageId, sentAt: record.sentAt };
  }

  /** Simula un evento webhook (delivery/open/bounce/reply…) per test e demo. */
  simulateEvent(providerMessageId: string, type: MessageEventType, recipient: string): ResendWebhookEvent {
    return {
      providerEventId: `mock-evt-${stableHash(`${providerMessageId}|${type}|${this.sentMessages.length}`).toString(36)}`,
      type,
      providerMessageId,
      recipient,
      occurredAt: new Date().toISOString(),
      payload: { simulated: true },
    };
  }

  parseWebhookEvent(rawBody: string, signature: string | null): ResendWebhookEvent {
    // In mock mode la firma è convenzionale: qualsiasi stringa non vuota va bene.
    if (signature !== null && signature !== 'mock-signature') {
      throw new Error('ResendMock: firma webhook non valida (attesa "mock-signature")');
    }
    const parsed = JSON.parse(rawBody) as ResendWebhookEvent;
    if (!parsed.providerEventId || !parsed.type || !parsed.providerMessageId) {
      throw new Error('ResendMock: payload webhook malformato');
    }
    return parsed;
  }
}
