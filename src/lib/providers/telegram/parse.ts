import type { NormalizedInboundMessage } from '@/lib/inbound/types';
import type { TelegramMessage, TelegramUpdate } from './types';

export function parseTelegramUpdate(rawBody: string): NormalizedInboundMessage | null {
  let update: TelegramUpdate;
  try {
    update = JSON.parse(rawBody) as TelegramUpdate;
  } catch {
    return null;
  }

  const msg = update.message ?? update.edited_message ?? null;
  if (!msg?.message_id || !msg.chat?.id || !msg.from?.id) return null;

  const text = (msg.text ?? msg.caption ?? '').trim();
  if (!text) return null;

  const chatType = msg.chat.type ?? 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';
  const display =
    [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ').trim() ||
    msg.from.username ||
    `Telegram ${msg.from.id}`;

  const updateId = update.update_id != null ? String(update.update_id) : `msg:${msg.message_id}`;

  return {
    channel: 'telegram',
    providerEventId: `telegram:update:${updateId}`,
    providerMessageId: String(msg.message_id),
    chatId: String(msg.chat.id),
    chatType,
    chatTitle: msg.chat.title ?? null,
    chatUsername: msg.chat.username ?? null,
    authorId: String(msg.from.id),
    authorUsername: msg.from.username ?? null,
    authorDisplayName: display,
    text,
    occurredAt: msg.date
      ? new Date(msg.date * 1000).toISOString()
      : new Date().toISOString(),
    replyToMessageId: String(msg.message_id),
    isGroup,
    isFromBot: Boolean(msg.from.is_bot),
    raw: msg as unknown as Record<string, unknown>,
  };
}

export function isTelegramBotCommand(msg: TelegramMessage): boolean {
  const text = (msg.text ?? '').trim();
  return text.startsWith('/');
}
