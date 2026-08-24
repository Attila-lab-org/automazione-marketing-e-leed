import type { IntentMatch, NormalizedInboundMessage } from './types';

const RULES: Array<{ intent: IntentMatch['intent']; keywords: string[] }> = [
  {
    intent: 'ECOMMERCE_REQUEST',
    keywords: [
      'ecommerce',
      'e-commerce',
      'e commerce',
      'negozio online',
      'shop online',
      'vendere online',
      'carrello',
      'woocommerce',
      'shopify',
    ],
  },
  {
    intent: 'WEBSITE_REQUEST',
    keywords: [
      'sito web',
      'sito internet',
      'fare un sito',
      'creare un sito',
      'realizzare un sito',
      'nuovo sito',
      'rifare il sito',
      'rifacimento sito',
      'landing page',
      'pagina web',
    ],
  },
  {
    intent: 'DIGITAL_PRESENCE',
    keywords: [
      'presenza online',
      'presenza digitale',
      'vetrina online',
      'visibilita online',
      'visibilità online',
      'google business',
      'profilo online',
    ],
  },
  {
    intent: 'QUOTE_REQUEST',
    keywords: [
      'preventivo',
      'quanto costa',
      'costo sito',
      'prezzo sito',
      'consigliate',
      'qualcuno conosce',
      'mi serve un',
      'cerco qualcuno',
    ],
  },
];

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
export function classifyInboundIntent(message: NormalizedInboundMessage): IntentMatch {
  const text = normalizeText(message.text);
  if (!text || text.length < 8) {
    return { intent: 'UNKNOWN', matched: false, keywords: [], confidence: 0 };
  }
  if (IGNORE.some((w) => text.includes(w))) {
    return { intent: 'UNKNOWN', matched: false, keywords: [], confidence: 0 };
  }

  for (const rule of RULES) {
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
