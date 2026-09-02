export type OperatorIntentKind =
  | 'READ'
  | 'PREPARE'
  | 'EXTERNAL'
  | 'POLICY'
  | 'HELP'
  | 'DESTRUCTIVE'
  | 'UNKNOWN';

export type OperatorIntent = {
  kind: OperatorIntentKind;
  city: string | null;
  category: string | null;
  limit: number;
  deliveryMode: 'TEST' | 'PRODUCTION' | null;
  campaignHint: string | null;
  leadLimitRequested: boolean;
  writeVerb: string | null;
};

const CITIES = [
  'milano',
  'roma',
  'napoli',
  'torino',
  'firenze',
  'bologna',
  'bergamo',
  'brescia',
  'genova',
  'padova',
  'verona',
];

const NUMBER_WORDS: Array<[RegExp, number]> = [
  [/\b(?:venti)\b/, 20],
  [/\b(?:diciannove)\b/, 19],
  [/\b(?:diciotto)\b/, 18],
  [/\b(?:diciassette)\b/, 17],
  [/\b(?:sedici)\b/, 16],
  [/\b(?:quindici)\b/, 15],
  [/\b(?:quattordici)\b/, 14],
  [/\b(?:tredici)\b/, 13],
  [/\b(?:dodici)\b/, 12],
  [/\b(?:undici)\b/, 11],
  [/\b(?:dieci)\b/, 10],
  [/\b(?:nove)\b/, 9],
  [/\b(?:otto)\b/, 8],
  [/\b(?:sette)\b/, 7],
  [/\b(?:sei)\b/, 6],
  [/\b(?:cinque)\b/, 5],
  [/\b(?:quattro)\b/, 4],
  [/\b(?:tre)\b/, 3],
  [/\b(?:due)\b/, 2],
  [/\b(?:uno|una)\b/, 1],
];

function requestedLimit(q: string): { value: number; explicit: boolean } {
  const digit = q.match(/\b(\d{1,2})\b/);
  if (digit) return { value: Math.min(20, Math.max(1, Number(digit[1]))), explicit: true };
  const word = NUMBER_WORDS.find(([pattern]) => pattern.test(q));
  return word ? { value: word[1], explicit: true } : { value: 8, explicit: false };
}

export function inferRequestedCategory(q: string): string | null {
  const categories: Array<[RegExp, string]> = [
    [/\bristorant|\btrattori|\bpizzeri/, 'restaurant'],
    [/\bhotel|\balbergh|\bb&b\b|\bbed and breakfast/, 'hotel'],
    [/\bdentist|\bstudi odontoiatric/, 'dentist'],
    [/\bparrucchier|\bsalon|\bbarber/, 'hair salon'],
    [/\bpalestr|\bfitness|\bgym\b/, 'gym'],
    [/\bcentri? estetic|\bestetist|\bbeauty/, 'beauty'],
    [/\bbar\b|\bcaffetteri/, 'bar'],
  ];
  return categories.find(([pattern]) => pattern.test(q))?.[1] ?? null;
}

export function extractRequestedCity(question: string): string | null {
  const known = CITIES.find((city) => new RegExp(`\\b${city}\\b`, 'i').test(question));
  if (known) return known;

  const categoryCue =
    /\b(?:ristoranti?|trattorie?|pizzerie?|hotel|alberghi?|b&b|dentisti?|studi odontoiatrici?|parrucchieri?|barber|palestre?|fitness|centri estetici?|estetiste?|bar|caffetterie?)\b/i.exec(
      question,
    );
  const businessCue = categoryCue ?? /\b(?:clienti?|contatti?|attivit[aà]|aziende?|imprese?)\b/i.exec(question);
  if (!businessCue?.[0] || businessCue.index == null) return null;

  const afterCue = question.slice(businessCue.index + businessCue[0].length);
  const location = afterCue.match(/\b(?:a|ad|di|in|zona)\s+([^,.;!?]+)/i)?.[1];
  if (!location) return null;
  const cleaned = location
    .split(/\b(?:con|per|usando|che|dove|massimo|max|e poi)\b/i)[0]
    ?.replace(/\b(?:una|un)\s+campagna\b.*$/i, '')
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned.replace(/\s+/g, ' ');
}

function baseFields(question: string, q: string): Omit<OperatorIntent, 'kind' | 'writeVerb'> {
  const requested = requestedLimit(q);
  const category = inferRequestedCategory(q);
  const deliveryMode: OperatorIntent['deliveryMode'] = /\btest\b/.test(q)
    ? 'TEST'
    : /\bproduzione\b/.test(q)
      ? 'PRODUCTION'
      : null;
  const campaignHint = /telegram/.test(q) ? 'telegram' : null;
  return {
    city: extractRequestedCity(question),
    category,
    limit: requested.value,
    deliveryMode,
    campaignHint,
    leadLimitRequested: requested.explicit,
  };
}

function intent(
  kind: OperatorIntentKind,
  question: string,
  q: string,
  writeVerb: string | null,
): OperatorIntent {
  return { kind, ...baseFields(question, q), writeVerb };
}

function isHelpQuestion(q: string): boolean {
  return /cosa puoi fare|che cosa puoi fare|cosa sai fare|che cosa sai fare|che cosa fai\b|cosa fai\?|aiutami a capire cosa|capacit[aà]|\bhelp\b|\baiuto\b/.test(
    q,
  );
}

export function isBulkCampaignWipe(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /cancell|elimina|delete|rimuovi|svuota/.test(q) &&
    /tutte|tutti|tutto/.test(q) &&
    /campagn|mail|email|inviat/.test(q)
  );
}

export function isBulkConversationArchive(
  question: string,
  ctx?: { entityType?: string | null; route?: string | null },
): boolean {
  const q = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!/\b(tutte|tutti|tutto)\b/.test(q)) return false;
  if (/campagn|invii email|questo invio|questa campagna/.test(q)) return false;
  if (/archivi/.test(q) && /conversaz|chat|thread|messagg/.test(q)) return true;
  if (/(cancell|elimin).{0,24}(conversaz|chat|thread|messagg)/.test(q)) return true;
  if (!/archivi/.test(q)) return false;
  const route = (ctx?.route ?? '').toLowerCase();
  return route.includes('/inbox') || route.includes('/telegram') || ctx?.entityType === 'thread';
}

export function isOpenedCampaignFollowup(question: string): boolean {
  return /l['’ ]?ho aperta|l ho aperta|e aperta|è aperta|l['’]ho aperta/.test(question.toLowerCase());
}

export const ATTILA_UNAVAILABLE_REPLY =
  'Non dipende dalle campagne. A volte il servizio che mi aiuta a ragionare non risponde. Riprova tra un attimo.';

export function isAttilaAvailabilityQuestion(
  question: string,
  history: Array<{ role: string; content: string }> = [],
): boolean {
  const q = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    /(modalit|attila|intelligenza|servizio).{0,48}(non disponibile|non funziona|non risponde|spento)/.test(q) ||
    /(non disponibile|non funziona).{0,48}(modalit|attila)/.test(q)
  ) {
    return true;
  }
  if (/perch/.test(q) && /(modalit|attila|\bai\b|non disponibile)/.test(q)) return true;
  const lastAssistant =
    [...history].reverse().find((item) => item.role === 'assistant')?.content.toLowerCase() ?? '';
  const lastWasDown =
    /non disponibile|non riesco a ragionare|riprova tra un attimo|servizio che mi aiuta a ragionare/.test(
      lastAssistant,
    );
  return lastWasDown && /^(perch|e perche|ma perche|come mai)/.test(q.trim());
}

function isDestructiveQuestion(q: string): boolean {
  if (isBulkCampaignWipe(q)) return true;
  if (/cancellala|eliminala|cancellala definitivamente|eliminala definitivamente/.test(q)) return true;
  if (/elimina definitivamente|cancell[ae] definitivamente|hard.?delete/.test(q)) return true;
  if (/archivi/.test(q) && /campagn|invio/.test(q)) return true;
  return /cancell[aeio]|elimina|delete|rimuovi/.test(q) && /campagn|questa|quella/.test(q);
}

function isWhyQuestion(q: string): boolean {
  return /perch|perché|perche|perchè|blocc|blocker/.test(q);
}

function isPauseCommand(q: string): boolean {
  if (isWhyQuestion(q)) return false;
  if (/metti(?:mi)? in pausa|pausa la campagna|ferma questa|ferma la campagna/.test(q)) return true;
  if (/^(pausa|ferma|stop)$/.test(q.trim())) return true;
  return /\b(ferma|pausa)\s+(la |questa )?(campagna)?/.test(q) && /campagn|questa/.test(q);
}

function isReadQuestion(q: string): boolean {
  if (
    /ieri|oggi|andata|report|numeri|briefing|brief|lead|attivit|miglior|ristorant|review|da controllare|messagg|inbox|conversaz|telegram|riepilogo|dashboard|quanto|blocc|perch|blocker|aprila|apri questa|apri la campagna|stato della campagna|dettagli campagna|appuntament|calendario|disponibilit|slot|fissat|confermat|sicurezz|check-?up|checkup|lucchetto|guarda/.test(
      q,
    )
  ) {
    return true;
  }
  return new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i').test(q);
}

export function classifyOperatorIntent(question: string): OperatorIntent {
  const q = question.toLowerCase();
  const demoOutcome = /\bdemo\b|anteprim|propost[ae] (?:visiv|sito)|siti? dimostrativ/.test(q);
  const demoAction =
    /prepar|crea|genera|realizz|produc|costruisc|fammi|mi serv|vorrei|ho bisogno|puoi (?:fare|creare|preparare|generare)/.test(
      q,
    );
  const demoBatchRequest =
    demoOutcome && demoAction && !/vedere|mostra|elenca|quante|controlla|apri/.test(q);

  if (demoBatchRequest) return intent('PREPARE', question, q, 'prepare');
  if (isHelpQuestion(q)) return intent('HELP', question, q, null);

  if (
    /gestisci automaticamente|autonom|non concedere sconti|chiamami quando|fammi intervenire/.test(q)
  ) {
    return intent('POLICY', question, q, 'policy');
  }

  if (isDestructiveQuestion(q)) {
    const hardDelete = /definitiv|hard.?delete/.test(q);
    return intent('DESTRUCTIVE', question, q, hardDelete ? 'hard_delete' : 'cancel');
  }

  if (
    /invia la campagna|avvia la campagna|manda la campagna|send campaign|invia queste|invia i messaggi/.test(
      q,
    )
  ) {
    return intent('EXTERNAL', question, q, 'send');
  }

  if (isPauseCommand(q)) {
    return intent('PREPARE', question, q, 'pause');
  }

  if (
    /prepara(?:mi)?|crea(?:mi)?(?: una)? campagna|fammi una campagna|genera(?:mi)?|rigenera|analizz|riprendi|resume|fai partire|lancia/.test(
      q,
    )
  ) {
    const externalStart = /fai partire|lancia|avvia/.test(q) && /invia|produzione|email reali/.test(q);
    const writeVerb = /riprendi|resume/.test(q)
      ? 'resume'
      : /rigenera/.test(q)
        ? 'regenerate'
        : /analizza/.test(q)
          ? 'analyze'
          : 'prepare';
    return intent(externalStart ? 'EXTERNAL' : 'PREPARE', question, q, writeVerb);
  }

  if (isReadQuestion(q)) return intent('READ', question, q, null);

  return intent('UNKNOWN', question, q, null);
}

export function isWriteLikeQuestion(question: string): boolean {
  const kind = classifyOperatorIntent(question).kind;
  return kind === 'PREPARE' || kind === 'EXTERNAL' || kind === 'POLICY' || kind === 'DESTRUCTIVE';
}
