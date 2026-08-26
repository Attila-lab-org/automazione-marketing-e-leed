import type { OperatorEnvelope } from './envelope';
import type { OperatorEntityRefs } from './context';
import type {
  OperatorHistoryItem,
  OperatorPlan,
  OperatorPrepareKind,
  OperatorSafetyClass,
} from './orchestrator-schema';
import type { OperatorToolName } from './registry';
import { detectOperatorOpsAction } from './ops-writes';

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTelegramReplyRequest(question: string): boolean {
  const q = norm(question);
  return (
    q.includes('telegram') &&
    scoreCues(q, ['rispondi', 'risposta', 'reply', 'manda risposta', 'invia risposta']) > 0
  );
}

function scoreCues(haystack: string, cues: string[]): number {
  let score = 0;
  for (const cue of cues) {
    if (haystack.includes(cue)) score += Math.min(4, Math.max(1, Math.ceil(cue.length / 6)));
  }
  return score;
}

function call(
  name: OperatorToolName,
  extra: Partial<{
    city: string | null;
    query: string | null;
    category: string | null;
    campaignId: string | null;
    leadId: string | null;
    demoId: string | null;
    templateId: string | null;
    threadId: string | null;
    limit: number | null;
  }> = {},
): OperatorPlan['toolCalls'][number] {
  return {
    name,
    city: extra.city ?? null,
    query: extra.query ?? null,
    category: extra.category ?? null,
    campaignId: extra.campaignId ?? null,
    leadId: extra.leadId ?? null,
    demoId: extra.demoId ?? null,
    templateId: extra.templateId ?? null,
    threadId: extra.threadId ?? null,
    limit: extra.limit ?? null,
  };
}

function extractCity(q: string): string | null {
  const cities = [
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
  return cities.find((c) => q.includes(c)) ?? null;
}

function extractLimit(q: string, fallback: number): number {
  const match = q.match(/\b(\d{1,2})\b/);
  if (match) return Math.min(20, Math.max(1, Number(match[1])));
  const words: Array<[string, number]> = [
    ['venti', 20],
    ['diciannove', 19],
    ['diciotto', 18],
    ['diciassette', 17],
    ['sedici', 16],
    ['quindici', 15],
    ['quattordici', 14],
    ['tredici', 13],
    ['dodici', 12],
    ['undici', 11],
    ['dieci', 10],
    ['nove', 9],
    ['otto', 8],
    ['sette', 7],
    ['sei', 6],
    ['cinque', 5],
    ['quattro', 4],
    ['tre', 3],
    ['due', 2],
    ['uno', 1],
    ['una', 1],
  ];
  return words.find(([word]) => new RegExp(`\\b${word}\\b`).test(q))?.[1] ?? fallback;
}

function extractCategory(q: string): string | null {
  const categories: Array<[RegExp, string]> = [
    [/\bristorant|\btrattori|\bpizzeri/, 'restaurant'],
    [/\bhotel|\balbergh|\bb b\b|\bbed and breakfast/, 'hotel'],
    [/\bdentist|\bstudi odontoiatric/, 'dentist'],
    [/\bparrucchier|\bsalon|\bbarber/, 'hair salon'],
    [/\bpalestr|\bfitness|\bgym\b/, 'gym'],
    [/\bcentri? estetic|\bestetist|\bbeauty/, 'beauty'],
    [/\bbar\b|\bcaffetteri/, 'bar'],
  ];
  return categories.find(([pattern]) => pattern.test(q))?.[1] ?? null;
}

function extractOrdinal(q: string): number | null {
  const map: Array<[string, number]> = [
    ['il primo', 1],
    ['la prima', 1],
    ['il secondo', 2],
    ['la seconda', 2],
    ['il terzo', 3],
    ['la terza', 3],
    ['il quarto', 4],
    ['il quinto', 5],
  ];
  for (const [cue, n] of map) {
    if (q.includes(cue)) return n;
  }
  return null;
}

function planOf(
  partial: Omit<OperatorPlan, 'prepareKind'> & { prepareKind?: OperatorPrepareKind },
): OperatorPlan {
  return { prepareKind: 'none', ...partial };
}

export type SemanticPlanInput = {
  question: string;
  history?: OperatorHistoryItem[];
  refs: OperatorEntityRefs;
  envelope: OperatorEnvelope;
};

/**
 * Cervello mock: bucket semantici a punteggio, non una regex per frase.
 * OpenAI sostituisce questa funzione in produzione.
 */
export function planOperatorTurnMock(input: SemanticPlanInput): OperatorPlan {
  const q = norm(input.question);
  const city = extractCity(q) ?? (input.envelope.filters?.city ? norm(input.envelope.filters.city) : null);
  const category = extractCategory(q);
  const ordinal = extractOrdinal(q);
  const campaignId =
    input.envelope.entityType === 'campaign' ? input.envelope.entityId ?? null : input.refs.lastCampaignId;
  const leadId =
    input.envelope.entityType === 'lead' ? input.envelope.entityId ?? null : input.refs.lastLeadId;
  const demoId = input.refs.lastDemoId;
  const templateId = input.refs.lastTemplateId;

  const telegramScan =
    q.includes('telegram') &&
    !q.includes('campagna') &&
    scoreCues(q, ['ricerca', 'cerca', 'scan', 'ascolto', 'monitor', 'intercett', 'parti', 'avvia', 'fai partire']) >
      0;

  if (telegramScan) {
    return planOf({
      safetyClass: 'READ',
      goal: 'Telegram inbound: nessuna campagna vuota',
      toolCalls: [call('get_telegram_inbound_status')],
      ordinal,
      clarification: null,
      telegramIsInboundScan: true,
      prepareKind: 'none',
    });
  }

  const inspectTools = demoId
    ? [call('inspect_demo', { demoId, leadId })]
    : templateId
      ? [call('inspect_template', { templateId })]
      : [call('list_demos'), call('list_templates')];

  const buckets: Array<{
    id: string;
    class: OperatorSafetyClass;
    score: number;
    tools: OperatorPlan['toolCalls'];
    goal: string;
    prepareKind: OperatorPrepareKind;
  }> = [
    {
      id: 'help',
      class: 'HELP',
      score: scoreCues(q, [
        'puoi fare',
        'sai fare',
        'capacit',
        'come mi puoi',
        'tutto cio',
        'aiutarmi',
        'cosa fai',
        'come mi puoi aiutare',
      ]),
      tools: [],
      goal: 'Elencare le capability realmente registrate',
      prepareKind: 'none',
    },
    {
      id: 'situation',
      class: 'READ',
      score: scoreCues(q, ['da dove', 'partirest', 'partiamo', 'priorit', 'possiamo partire', 'inizio']),
      tools: [
        call('get_daily_briefing'),
        call('get_dashboard_summary'),
        call('get_blockers', { campaignId }),
        call('list_campaigns'),
      ],
      goal: 'Analizzare lo stato attuale e proporre da dove partire',
      prepareKind: 'none',
    },
    {
      id: 'insights',
      class: 'READ',
      score: scoreCues(q, [
        'consigliami',
        'cosa mi consigli',
        'oggi cosa',
        'cosa migliorare',
        'come migliorare',
        'imparato',
        'conversion',
        'strategia',
        'proattiv',
        'cosa sta funzionando',
      ]),
      tools: [
        call('get_active_commercial_goal'),
        call('get_commercial_goal_plan'),
        call('get_daily_briefing'),
        call('get_commercial_insights'),
      ],
      goal: 'Imparare dagli eventi e proporre la prossima azione commerciale',
      prepareKind: 'none',
    },
    {
      id: 'commercial-goal',
      class: 'READ',
      score: scoreCues(q, [
        'obiettivo',
        'goal',
        'target',
        'autopilot',
        'siamo in linea',
        'ritmo',
        'piano commerciale',
      ]),
      tools: [
        call('get_active_commercial_goal'),
        call('get_commercial_goal_plan'),
      ],
      goal: 'Leggere avanzamento, piano e prossima verifica dell’obiettivo commerciale',
      prepareKind: 'none',
    },
    {
      id: 'prepare',
      class: 'PREPARE',
      score: (() => {
        const trial = scoreCues(q, ['test', 'prova', 'campagna']);
        const make = scoreCues(q, ['crea', 'prepara', 'fammi', 'genera', 'lancia', 'preparami', 'facciamo']);
        const demoOutcome = scoreCues(q, [
          'demo',
          'anteprim',
          'proposta visiva',
          'proposte visive',
          'sito dimostrativo',
          'siti dimostrativi',
        ]);
        const naturalNeed = scoreCues(q, [
          'mi serv',
          'vorrei',
          'ho bisogno',
          'puoi fare',
          'realizza',
          'produci',
          'costruisci',
        ]);
        if (
          demoOutcome > 0 &&
          (make > 0 || naturalNeed > 0) &&
          !/vedere|mostra|elenca|quante|controlla|apri/.test(q)
        ) {
          return 20 + demoOutcome + make + naturalNeed;
        }
        if (trial > 0 && make > 0) return 12 + trial + make;
        return scoreCues(q, ['prepara campagna', 'crea campagna', 'campagna test', 'campagna di prova']);
      })(),
      tools: [
        call('search_leads', {
          city,
          category,
          limit: extractLimit(q, 8),
        }),
      ],
      goal: 'Creare e preparare una campagna TEST senza inviare',
      prepareKind: 'campaign',
    },
    {
      id: 'pause',
      class: 'PREPARE',
      score: scoreCues(q, ['ferma quella', 'ferma questa', 'metti in pausa', 'pausa la']),
      tools: campaignId ? [call('get_campaign_detail', { campaignId })] : [call('list_campaigns')],
      goal: 'Mettere in pausa la campagna di contesto',
      prepareKind: 'pause',
    },
    {
      id: 'telegram',
      class: 'READ',
      score: q.includes('telegram') && !q.includes('campagna') ? 6 : 0,
      tools: [call('get_telegram_inbound_status')],
      goal: 'Spiegare e mostrare lo stato del monitoraggio Telegram inbound',
      prepareKind: 'none',
    },
    {
      id: 'personalize',
      class: 'PREPARE',
      score: scoreCues(q, [
        'migliora i testi',
        'miglioragli',
        'personalizz',
        'troppo elegante',
        'troppo commerciale',
        'trattoria',
        'questo stile',
        'non mi piace',
        'fallo piu',
        'applical',
      ]),
      tools: inspectTools,
      goal: 'Proporre o applicare testi demo strutturati',
      prepareKind: /applica/.test(q) ? 'apply' : 'personalize',
    },
    {
      id: 'calendar',
      class: 'READ',
      score: scoreCues(q, [
        'appuntament',
        'calendario',
        'disponibilit',
        'slot',
        'fissat',
        'confermat',
        'chiamata',
        'quando ho',
        'quanti appuntament',
      ]),
      tools: [
        call('get_calendar_summary'),
        call('list_calendar_events', { limit: 10 }),
        ...(scoreCues(q, ['disponibilit', 'slot', 'liberi', 'alternative']) > 0
          ? [call('list_available_slots', { limit: 8 })]
          : []),
      ],
      goal: 'Leggere appuntamenti e disponibilità reali dal calendario',
      prepareKind: 'none',
    },
    {
      id: 'template',
      class: 'READ',
      score: scoreCues(q, ['template', 'demo', 'controlla', 'fammi vedere', 'apri la demo']),
      tools: inspectTools,
      goal: 'Ispezionare template o demo nel contesto',
      prepareKind: 'none',
    },
    {
      id: 'analyze',
      class: 'PREPARE',
      score: scoreCues(q, ['sito migliorabile', 'cosa faresti', 'analizza', 'analizzagli']),
      tools: [
        call('search_leads', {
          city,
          category: q.includes('ristor') ? 'restaurant' : null,
          limit: extractLimit(q, 5),
        }),
        ...(leadId ? [call('get_lead_detail', { leadId })] : []),
      ],
      goal: 'Analizzare un lead e mostrare cosa farei',
      prepareKind: 'analyze',
    },
    {
      id: 'send',
      class: 'EXTERNAL',
      score: scoreCues(q, ['manda', 'invia', 'mandala', 'avvia la campagna', 'send']),
      tools: campaignId ? [call('get_campaign_detail', { campaignId })] : [call('list_campaigns')],
      goal: 'Preparare conferma di invio, senza spedire',
      prepareKind: 'none',
    },
    {
      id: 'destroy',
      class: 'DESTRUCTIVE',
      score: scoreCues(q, ['cancella', 'elimina', 'cancellala', 'eliminala', 'rimuovi']),
      tools: campaignId ? [call('get_campaign_detail', { campaignId })] : [call('list_campaigns')],
      goal: 'Chiedere conferma per pausa, senza hard-delete',
      prepareKind: 'none',
    },
    {
      id: 'daily',
      class: 'READ',
      score: scoreCues(q, ['ieri', 'oggi', 'andata', 'report', 'numeri', 'briefing', 'brief']),
      tools: [call('get_daily_report')],
      goal: 'Riassumere i numeri del periodo',
      prepareKind: 'none',
    },
    {
      id: 'leads',
      class: 'READ',
      score: scoreCues(q, ['lead', 'ristor', 'attivita', 'trova', 'migliori', 'milano', 'confront', 'forti']),
      tools: [
        call('search_leads', {
          city,
          category: q.includes('ristor') ? 'restaurant' : null,
          limit: extractLimit(q, 8),
        }),
      ],
      goal: 'Trovare e confrontare lead',
      prepareKind: 'none',
    },
    {
      id: 'blockers',
      class: 'READ',
      score: scoreCues(q, ['blocc', 'perch', 'blocker']),
      tools: [
        ...(campaignId
          ? [call('get_campaign_detail', { campaignId }), call('get_blockers', { campaignId })]
          : [call('list_campaigns'), call('get_blockers')]),
      ],
      goal: 'Spiegare i blocker',
      prepareKind: 'none',
    },
  ];

  const ranked = [...buckets].sort((a, b) => b.score - a.score);
  let top = ranked[0];
  const situation = buckets.find((b) => b.id === 'situation');
  if (top?.id === 'help' && situation && situation.score >= 2) {
    top = situation;
  }

  if (!top || top.score <= 0) {
    if (ordinal && (input.refs.lastLeadIds.length || input.refs.lastDemoId)) {
      const selectedLead = ordinal ? input.refs.lastLeadIds[ordinal - 1] ?? null : null;
      return planOf({
        safetyClass: 'READ',
        goal: 'Risolvere il referente ordinale della lista precedente',
        toolCalls: selectedLead
          ? [call('get_lead_detail', { leadId: selectedLead })]
          : demoId
            ? [call('inspect_demo', { demoId })]
            : [],
        ordinal,
        clarification: selectedLead || demoId ? null : 'Quale elemento intendi?',
        telegramIsInboundScan: false,
        prepareKind: 'none',
      });
    }
    return planOf({
      safetyClass: 'UNKNOWN',
      goal: 'Chiedere chiarimento',
      toolCalls: [],
      ordinal,
      clarification:
        'Non ho collegato la richiesta a un’azione del Sales OS. Vuoi lead, una campagna TEST, una demo o lo stato di Telegram?',
      telegramIsInboundScan: false,
      prepareKind: 'none',
    });
  }

  return planOf({
    safetyClass: top.class,
    goal: top.goal,
    toolCalls: top.tools,
    ordinal,
    clarification: null,
    telegramIsInboundScan: false,
    prepareKind: top.prepareKind,
  });
}

export function applySafetyPolicy(plan: OperatorPlan, question: string): OperatorPlan {
  const q = norm(question);
  const ops = detectOperatorOpsAction(question);
  if (ops !== 'none') {
    const toolCalls: OperatorPlan['toolCalls'] =
      ops === 'start_telegram' || ops === 'stop_telegram'
        ? [call('get_telegram_inbound_status')]
        : ops === 'take_over' ||
            ops === 'return_to_ai' ||
            ops === 'stop_automation' ||
            ops === 'reply_telegram'
          ? [call('list_conversations')]
          : [];
    return {
      ...plan,
      // READ evita prepare campagna / send_pending; l’azione ops gira a parte in turn.ts
      safetyClass: 'READ',
      telegramIsInboundScan: false,
      prepareKind: 'none',
      toolCalls,
      goal: `Operazione commerciale: ${ops}`,
      clarification: null,
    };
  }
  if (isTelegramReplyRequest(question)) {
    return {
      ...plan,
      safetyClass: 'READ',
      telegramIsInboundScan: false,
      prepareKind: 'none',
      toolCalls: [],
      goal: 'Rispondere all’ultimo messaggio Telegram in attesa',
      clarification: null,
    };
  }
  const telegramScan =
    q.includes('telegram') &&
    !q.includes('campagna') &&
    scoreCues(q, ['ricerca', 'cerca', 'scan', 'ascolto', 'monitor', 'intercett']) > 0;
  if (telegramScan || plan.telegramIsInboundScan) {
    return {
      ...plan,
      safetyClass: 'READ',
      telegramIsInboundScan: true,
      prepareKind: 'none',
      toolCalls: [call('get_telegram_inbound_status')],
      goal: 'Telegram riceve e scansiona inbound; non crea campagne',
    };
  }
  return plan;
}
