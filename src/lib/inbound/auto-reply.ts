import type { IntentMatch, NormalizedInboundMessage } from './types';

/**
 * Risposta automatica breve e sicura.
 * Nessuna trattativa, nessun prezzo inventato, nessun follow-up.
 */
export function buildAutoReplyText(args: {
  message: NormalizedInboundMessage;
  intent: IntentMatch;
  studioName?: string;
  template?: string;
}): string | null {
  if (!args.intent.matched) return null;

  const studio = args.studioName?.trim() || 'Attila Lab';
  const name = args.message.authorDisplayName.split(/\s+/)[0] || 'Ciao';

  const opener =
    args.intent.intent === 'ECOMMERCE_REQUEST'
      ? 'ho visto che stai cercando un e-commerce'
      : args.intent.intent === 'WEBSITE_REQUEST'
        ? 'ho visto che stai cercando un sito web'
        : args.intent.intent === 'DIGITAL_PRESENCE'
          ? 'ho visto che stai cercando di migliorare la presenza online'
          : 'ho visto la tua richiesta';

  const requestLabel =
    args.intent.intent === 'ECOMMERCE_REQUEST'
      ? 'un e-commerce'
      : args.intent.intent === 'WEBSITE_REQUEST'
        ? 'un sito web'
        : args.intent.intent === 'DIGITAL_PRESENCE'
          ? 'la presenza online'
          : 'un preventivo';

  if (args.template?.trim()) {
    return args.template
      .trim()
      .replaceAll('{nome}', name)
      .replaceAll('{studio}', studio)
      .replaceAll('{richiesta}', requestLabel)
      .replaceAll('{messaggio}', args.message.text.slice(0, 280));
  }

  if (args.message.isGroup) {
    return `${name}, ${opener}. Sono ${studio}: possiamo aiutarti senza impegno. Scrivimi in privato e ti rispondiamo noi.`;
  }

  return `${name}, ${opener}. Sono ${studio}. Se vuoi, raccontaci in due righe cosa ti serve e ti rispondiamo senza impegno.`;
}
