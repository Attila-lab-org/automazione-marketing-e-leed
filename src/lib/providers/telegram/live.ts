import type { OutboundReplyInput, OutboundReplyResult } from '@/lib/inbound/types';
import { parseTelegramUpdate } from './parse';
import type { TelegramProvider } from './types';

export class TelegramLive implements TelegramProvider {
  readonly channel = 'telegram' as const;

  constructor(private readonly botToken: string) {
    if (!botToken.trim()) {
      throw new Error('TelegramLive: TELEGRAM_BOT_TOKEN mancante');
    }
  }

  verifyWebhook(args: { headers: Headers; env?: NodeJS.ProcessEnv }): void {
    const expected = args.env?.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected) {
      throw new Error('TelegramLive: TELEGRAM_WEBHOOK_SECRET mancante');
    }
    const got = args.headers.get('x-telegram-bot-api-secret-token');
    if (!got || got !== expected) {
      throw new Error('TelegramLive: webhook secret non valido');
    }
  }

  parseInbound(rawBody: string) {
    return parseTelegramUpdate(rawBody);
  }

  async reply(input: OutboundReplyInput): Promise<OutboundReplyResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true,
    };
    if (input.replyToMessageId) {
      body.reply_to_message_id = Number(input.replyToMessageId);
      body.allow_sending_without_reply = true;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number; date?: number };
    };
    if (!res.ok || !data.ok || !data.result?.message_id) {
      throw new Error(`TelegramLive.reply: ${data.description ?? res.statusText}`);
    }
    return {
      providerMessageId: String(data.result.message_id),
      sentAt: data.result.date
        ? new Date(data.result.date * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
}
