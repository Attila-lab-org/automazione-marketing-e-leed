import type { IntentMatch, NormalizedInboundMessage } from './types';
import {
  DEFAULT_TELEGRAM_SETTINGS,
  type TelegramKeywordGroups,
} from './telegram-settings';

const IGNORE = [
  'crypto',
  'forex',
  'casino',
  'scommesse',
  'porn',
  'xxx',
  'nudo',
];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classificatore keyword-based prudente.
 * Nessuna risposta aggressiva: se non matcha → UNKNOWN.
 */
export function classifyInboundIntent(
  message: NormalizedInboundMessage,
  keywords: TelegramKeywordGroups = DEFAULT_TELEGRAM_SETTINGS.keywords,
): IntentMatch {
  const text = normalizeText(message.text);
  if (!text || text.length < 8) {
    return { intent: 'UNKNOWN', matched: false, keywords: [], confidence: 0 };
  }
  if (IGNORE.some((w) => text.includes(w))) {
    return { intent: 'UNKNOWN', matched: false, keywords: [], confidence: 0 };
  }

  const rules: Array<{ intent: IntentMatch['intent']; keywords: string[] }> = [
    { intent: 'ECOMMERCE_REQUEST', keywords: keywords.ecommerce },
    { intent: 'WEBSITE_REQUEST', keywords: keywords.website },
    { intent: 'DIGITAL_PRESENCE', keywords: keywords.digitalPresence },
    { intent: 'QUOTE_REQUEST', keywords: keywords.quote },
  ];

  for (const rule of rules) {
    const hits = rule.keywords.filter((k) => text.includes(normalizeText(k)));
    if (hits.length > 0) {
      const confidence = Math.min(95, 55 + hits.length * 15);
      return {
        intent: rule.intent,
        matched: true,
        keywords: hits,
        confidence,
      };
    }
  }

  return { intent: 'UNKNOWN', matched: false, keywords: [], confidence: 0 };
}
