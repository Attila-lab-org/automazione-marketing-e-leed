import { describe, expect, it } from 'vitest';
import { buildAutoReplyText } from '../../src/lib/inbound/auto-reply';
import { INBOUND_CHANNEL_REGISTRY } from '../../src/lib/inbound/channels';
import { getInboundAdapter } from '../../src/lib/inbound/adapters';
import { classifyInboundIntent } from '../../src/lib/inbound/intent';
import {
  DEFAULT_TELEGRAM_SETTINGS,
  normalizeTelegramSettings,
} from '../../src/lib/inbound/telegram-settings';
import type { NormalizedInboundMessage } from '../../src/lib/inbound/types';
import { parseTelegramUpdate } from '../../src/lib/providers/telegram/parse';
import { TelegramMock } from '../../src/lib/providers/telegram/mock';

function baseMessage(
  overrides: Partial<NormalizedInboundMessage> = {},
): NormalizedInboundMessage {
  return {
    channel: 'telegram',
    providerEventId: 'telegram:update:1',
    providerMessageId: '10',
    chatId: '-1001',
    chatType: 'supergroup',
    chatTitle: 'Gruppo test',
    chatUsername: 'gruppo_test',
    authorId: '42',
    authorUsername: 'mario_rossi',
    authorDisplayName: 'Mario Rossi',
    text: 'Cerco qualcuno per fare un sito web',
    occurredAt: new Date().toISOString(),
    replyToMessageId: '10',
    isGroup: true,
    isFromBot: false,
    raw: {},
    ...overrides,
  };
}

describe('inbound intent classifier', () => {
  it('riconosce richiesta sito', () => {
    const m = classifyInboundIntent(baseMessage());
    expect(m.matched).toBe(true);
    expect(m.intent).toBe('WEBSITE_REQUEST');
    expect(m.keywords.length).toBeGreaterThan(0);
  });

  it('riconosce ecommerce', () => {
    const m = classifyInboundIntent(
      baseMessage({ text: 'Vorrei un e-commerce per vendere online' }),
    );
    expect(m.matched).toBe(true);
    expect(m.intent).toBe('ECOMMERCE_REQUEST');
  });

  it('ignora messaggi troppo corti o blacklist', () => {
    expect(classifyInboundIntent(baseMessage({ text: 'ciao' })).matched).toBe(false);
    expect(
      classifyInboundIntent(baseMessage({ text: 'sito web crypto casino' })).matched,
    ).toBe(false);
  });

  it('usa le parole chiave configurate dalla dashboard', () => {
    const configured = {
      ...DEFAULT_TELEGRAM_SETTINGS.keywords,
      website: ['restyling portale'],
    };
    expect(
      classifyInboundIntent(
        baseMessage({ text: 'Vorrei un restyling portale aziendale' }),
        configured,
      ).intent,
    ).toBe('WEBSITE_REQUEST');
    expect(
      classifyInboundIntent(
        baseMessage({ text: 'Vorrei un sito web aziendale' }),
        configured,
      ).matched,
    ).toBe(false);
  });
});

describe('auto-reply policy', () => {
  it('risponde breve in gruppo con invito al privato', () => {
    const intent = classifyInboundIntent(baseMessage());
    const text = buildAutoReplyText({
      message: baseMessage(),
      intent,
      studioName: 'Attila Lab',
    });
    expect(text).toBeTruthy();
    expect(text).toMatch(/privato/i);
    expect(text!.length).toBeLessThan(280);
  });

  it('non risponde senza match', () => {
    const intent = classifyInboundIntent(baseMessage({ text: 'che bella giornata' }));
    expect(
      buildAutoReplyText({ message: baseMessage({ text: 'che bella giornata' }), intent }),
    ).toBeNull();
  });

  it('compila il testo personalizzato con i campi disponibili', () => {
    const message = baseMessage({ authorDisplayName: 'Mario Rossi' });
    const intent = classifyInboundIntent(message);
    expect(
      buildAutoReplyText({
        message,
        intent,
        studioName: 'Attila Lab',
        template: 'Ciao {nome}, {studio} può aiutarti con {richiesta}.',
      }),
    ).toBe('Ciao Mario, Attila Lab può aiutarti con un sito web.');
  });
});

describe('telegram dashboard settings', () => {
  it('parte fermo e limita i valori salvati', () => {
    const settings = normalizeTelegramSettings({
      replyTemplate: ' Ciao {nome} ',
      keywords: { website: ['sito su misura', 'sito su misura', ''] },
    });
    expect(settings.enabled).toBe(false);
    expect(settings.replyTemplate).toBe('Ciao {nome}');
    expect(settings.keywords.website).toEqual(['sito su misura']);
  });
});

describe('telegram parse', () => {
  it('normalizza un update Telegram', () => {
    const raw = JSON.stringify({
      update_id: 99,
      message: {
        message_id: 7,
        date: 1_700_000_000,
        text: 'Mi serve un sito internet',
        chat: { id: -100, type: 'supergroup', title: 'Test' },
        from: {
          id: 55,
          is_bot: false,
          first_name: 'Anna',
          username: 'anna',
        },
      },
    });
    const msg = parseTelegramUpdate(raw);
    expect(msg?.channel).toBe('telegram');
    expect(msg?.authorUsername).toBe('anna');
    expect(msg?.isGroup).toBe(true);
    expect(msg?.chatType).toBe('supergroup');
    expect(msg?.chatTitle).toBe('Test');
    expect(msg?.providerMessageId).toBe('7');
  });

  it('mock reply registra l’invio', async () => {
    const mock = new TelegramMock();
    const sent = await mock.reply({ chatId: '1', text: 'ciao', replyToMessageId: '2' });
    expect(sent.providerMessageId).toMatch(/^mock-tg-/);
    expect(mock.sent).toHaveLength(1);
  });
});

describe('multi-channel registry / stubs', () => {
  it('Telegram ready, altri stub', () => {
    expect(INBOUND_CHANNEL_REGISTRY.filter((c) => c.status === 'ready').map((c) => c.channel)).toEqual([
      'telegram',
    ]);
    expect(INBOUND_CHANNEL_REGISTRY.filter((c) => c.status === 'stub')).toHaveLength(3);
  });

  it('adapter stub lancia errore chiaro', () => {
    const adapter = getInboundAdapter('discord');
    expect(() => adapter.verifyWebhook({ rawBody: '', headers: new Headers() })).toThrow(
      /non ancora implementato/,
    );
  });
});
