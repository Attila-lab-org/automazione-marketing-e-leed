import type { OutboundReplyInput, OutboundReplyResult } from '@/lib/inbound/types';
import { parseTelegramUpdate } from './parse';
import type { TelegramProvider } from './types';

/**
 * Mock Telegram — nessuna chiamata esterna.
 * Utile per test webhook e demo locali.
 */
export class TelegramMock implements TelegramProvider {
  readonly channel = 'telegram' as const;
  readonly sent: Array<OutboundReplyInput & OutboundReplyResult> = [];

  verifyWebhook(): void {
    // mock: always ok
  }

  parseInbound(rawBody: string) {
    return parseTelegramUpdate(rawBody);
  }

  async reply(input: OutboundReplyInput): Promise<OutboundReplyResult> {
    const result = {
      providerMessageId: `mock-tg-${Date.now()}`,
      sentAt: new Date().toISOString(),
    };
    this.sent.push({ ...input, ...result });
    return result;
  }
}
