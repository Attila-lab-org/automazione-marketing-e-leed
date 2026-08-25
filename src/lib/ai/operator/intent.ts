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

function baseFields(question: string, q: string): Omit<OperatorIntent, 'kind' | 'writeVerb'> {
  const cityMatch = question.match(new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i'));
  const limitMatch = q.match(/\b(\d{1,2})\b/);
  const limit = limitMatch ? Math.min(20, Math.max(1, Number(limitMatch[1]))) : 8;
  const category = /ristorant|restaurant|pizzer/.test(q) ? 'restaurant' : null;
  const deliveryMode: OperatorIntent['deliveryMode'] = /\btest\b/.test(q)
    ? 'TEST'
    : /\bproduzione\b/.test(q)
      ? 'PRODUCTION'
      : null;
  const campaignHint = /telegram/.test(q) ? 'telegram' : null;
  return {
    city: cityMatch?.[1] ?? null,
    category,
    limit,
    deliveryMode,
    campaignHint,
    leadLimitRequested: Boolean(limitMatch),
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
    /ieri|oggi|andata|report|numeri|briefing|brief|lead|attivit|miglior|ristorant|review|da controllare|messagg|inbox|conversaz|telegram|riepilogo|dashboard|quanto|blocc|perch|blocker|aprila|apri questa|apri la campagna|stato della campagna|dettagli campagna/.test(
      q,
    )
  ) {
    return true;
  }
  return new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i').test(q);
}

export function classifyOperatorIntent(question: string): OperatorIntent {
  const q = question.toLowerCase();

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
