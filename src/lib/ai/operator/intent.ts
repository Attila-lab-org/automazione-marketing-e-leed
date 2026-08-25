export type OperatorIntentKind = 'READ' | 'PREPARE' | 'EXTERNAL' | 'POLICY';

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

export function classifyOperatorIntent(question: string): OperatorIntent {
  const q = question.toLowerCase();
  const cityMatch = question.match(
    new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i'),
  );
  const limitMatch = q.match(/\b(\d{1,2})\b/);
  const limit = limitMatch ? Math.min(20, Math.max(1, Number(limitMatch[1]))) : 8;
  const category = /ristorant|restaurant|pizzer/.test(q) ? 'restaurant' : null;
  const deliveryMode = /\btest\b/.test(q) ? 'TEST' : /\bproduzione\b/.test(q) ? 'PRODUCTION' : null;
  const campaignHint = /telegram/.test(q) ? 'telegram' : null;

  if (
    /gestisci automaticamente|autonom|non concedere sconti|chiamami quando|fammi intervenire/.test(q)
  ) {
    return {
      kind: 'POLICY',
      city: cityMatch?.[1] ?? null,
      category,
      limit,
      deliveryMode,
      campaignHint,
      leadLimitRequested: Boolean(limitMatch),
      writeVerb: 'policy',
    };
  }

  if (
    /invia la campagna|avvia la campagna|manda la campagna|send campaign|invia queste|invia i messaggi/.test(
      q,
    )
  ) {
    return {
      kind: 'EXTERNAL',
      city: cityMatch?.[1] ?? null,
      category,
      limit,
      deliveryMode,
      campaignHint,
      leadLimitRequested: Boolean(limitMatch),
      writeVerb: 'send',
    };
  }

  if (
    /prepara(?:mi)?|crea(?:mi)? una campagna|fammi una campagna|genera(?:mi)?|rigenera|analizz|pausa|ferma la campagna|riprendi|resume|fai partire|lancia/.test(
      q,
    )
  ) {
    const externalStart = /fai partire|lancia|avvia/.test(q) && /invia|produzione|email reali/.test(q);
    return {
      kind: externalStart ? 'EXTERNAL' : 'PREPARE',
      city: cityMatch?.[1] ?? null,
      category,
      limit,
      deliveryMode: deliveryMode ?? (/test/.test(q) ? 'TEST' : null),
      campaignHint,
      leadLimitRequested: Boolean(limitMatch),
      writeVerb: /ferma|pausa/.test(q)
        ? 'pause'
        : /riprendi|resume/.test(q)
          ? 'resume'
          : /rigenera/.test(q)
            ? 'regenerate'
            : /analizza/.test(q)
              ? 'analyze'
              : 'prepare',
    };
  }

  return {
    kind: 'READ',
    city: cityMatch?.[1] ?? null,
    category,
    limit,
    deliveryMode,
    campaignHint,
    leadLimitRequested: Boolean(limitMatch),
    writeVerb: null,
  };
}

export function isWriteLikeQuestion(question: string): boolean {
  const kind = classifyOperatorIntent(question).kind;
  return kind === 'PREPARE' || kind === 'EXTERNAL' || kind === 'POLICY';
}
