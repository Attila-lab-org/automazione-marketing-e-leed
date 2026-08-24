import type { OutboundReplyInput, OutboundReplyResult } from '@/lib/inbound/types';
import type { NormalizedInboundMessage } from '@/lib/inbound/types';

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: {
    id: number;
    type?: string;
    title?: string;
    username?: string;
  };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
};

export interface TelegramProvider {
  readonly channel: 'telegram';
  verifyWebhook(args: {
    rawBody: string;
    headers: Headers;
    env?: NodeJS.ProcessEnv;
  }): void;
  parseInbound(rawBody: string): NormalizedInboundMessage | null;
  reply(input: OutboundReplyInput, env?: NodeJS.ProcessEnv): Promise<OutboundReplyResult>;
}
