/**
 * ResendProvider — contratto §11.2.
 *
 * - Integrazione server-side: le API key non arrivano MAI al client.
 * - send + gestione eventi webhook (verifica firma + idempotenza §18).
 */

import type { MessageEventType } from '../../types/domain';

export interface OutboundEmail {
  from: string;
  to: string;
  subject: string;
  /** snapshot immutabile del contenuto (§11 "Sent message") */
  html?: string;
  text?: string;
  /** idempotency key lato provider (no doppi invii, §11.2). */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
  sentAt: string;
}

export interface ResendWebhookEvent {
  /** id univoco evento provider → idempotenza webhook §18 */
  providerEventId: string;
  type: MessageEventType;
  providerMessageId: string;
  recipient: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface ResendProvider {
  send(message: OutboundEmail): Promise<SendResult>;
  /** Verifica firma e normalizza l'evento; lancia errore se firma invalida. */
  parseWebhookEvent(rawBody: string, signature: string | null): ResendWebhookEvent;
}
