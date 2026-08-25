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

function inferredCategory(q: string): string | null {
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

function baseFields(question: string, q: string): Omit<OperatorIntent, 'kind' | 'writeVerb'> {
  const cityMatch = question.match(new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i'));
  const requested = requestedLimit(q);
  const category = inferredCategory(q);
  const deliveryMode: OperatorIntent['deliveryMode'] = /\btest\b/.test(q)
    ? 'TEST'
    : /\bproduzione\b/.test(q)
      ? 'PRODUCTION'
      : null;
  const campaignHint = /telegram/.test(q) ? 'telegram' : null;
  return {
    city: cityMatch?.[1] ?? null,
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

function isDestructiveQuestion(q: string): boolean {
  if (/cancellala|eliminala|cancellala definitivamente|eliminala definitivamente/.test(q)) return true;
  if (/elimina definitivamente|cancell[ae] definitivamente|hard.?delete/.test(q)) return true;
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
    /ieri|oggi|andata|report|numeri|briefing|brief|lead|attivit|miglior|ristorant|review|da controllare|messagg|inbox|conversaz|telegram|riepilogo|dashboard|quanto|blocc|perch|blocker|aprila|apri questa|apri la campagna|stato della campagna|dettagli campagna|appuntament|calendario|disponibilit|slot|fissat|confermat/.test(
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
    /prepara(?:mi)?|crea(?:mi)? una campagna|fammi una campagna|genera(?:mi)?|rigenera|analizz|riprendi|resume|fai partire|lancia/.test(
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
