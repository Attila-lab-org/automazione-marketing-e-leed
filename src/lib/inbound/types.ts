/**
 * Contratto multi-canale inbound — Telegram implementato;
 * Discord / Mastodon / Bluesky solo stub di registry.
 */

export type InboundChannelId = 'telegram' | 'discord' | 'mastodon' | 'bluesky';

export type InboundIntent =
  | 'WEBSITE_REQUEST'
  | 'ECOMMERCE_REQUEST'
  | 'DIGITAL_PRESENCE'
  | 'QUOTE_REQUEST'
  | 'UNKNOWN';

export type NormalizedInboundMessage = {
  channel: InboundChannelId;
  /** Provider update / event id for idempotency */
  providerEventId: string;
  /** Provider message id (Telegram message_id) */
  providerMessageId: string;
  chatId: string;
  chatType: string;
  chatTitle: string | null;
  chatUsername: string | null;
  /** User id on the channel */
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string;
  text: string;
  /** ISO timestamp */
  occurredAt: string;
  /** Reply target for bot responses */
  replyToMessageId: string;
  isGroup: boolean;
  isFromBot: boolean;
  raw: Record<string, unknown>;
};

export type OutboundReplyInput = {
  chatId: string;
  text: string;
  replyToMessageId?: string | null;
};

export type OutboundReplyResult = {
  providerMessageId: string;
  sentAt: string;
};

export type IntentMatch = {
  intent: InboundIntent;
  matched: boolean;
  keywords: string[];
  confidence: number;
};

export interface InboundChannelAdapter {
  readonly channel: InboundChannelId;
  /** Verify webhook authenticity; throw if invalid. */
  verifyWebhook(args: {
    rawBody: string;
    headers: Headers;
    env?: NodeJS.ProcessEnv;
  }): void;
  /** Parse provider payload into normalized message, or null if not actionable. */
  parseInbound(rawBody: string): NormalizedInboundMessage | null;
  reply(input: OutboundReplyInput, env?: NodeJS.ProcessEnv): Promise<OutboundReplyResult>;
}

export type ChannelRegistryEntry = {
  channel: InboundChannelId;
  label: string;
  status: 'ready' | 'stub';
  sourceType:
    | 'TELEGRAM_INBOUND'
    | 'DISCORD_INBOUND'
    | 'MASTODON_INBOUND'
    | 'BLUESKY_INBOUND';
};
