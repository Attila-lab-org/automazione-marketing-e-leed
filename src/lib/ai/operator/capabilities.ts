import {
  DENIED_TOOL_NAMES,
  OPERATOR_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  type OperatorToolName,
} from './registry';

export const HARD_DELETE_FOLLOWUP = 'eliminala definitivamente';

export type OperatorAssistMode = 'ASSISTITO' | 'AUTO_CONTROLLATO';

export const OPERATOR_CONFIRM_TOOLS = ['send_campaign', 'enable_autonomy'] as const;

export const CAMPAIGN_MUTATION_CAPABILITIES = {
  pause: (WRITE_TOOL_NAMES as readonly string[]).includes('pause_campaign'),
  resume: (WRITE_TOOL_NAMES as readonly string[]).includes('resume_campaign'),
  archive: (WRITE_TOOL_NAMES as readonly string[]).includes('archive_campaign'),
  hardDelete: (WRITE_TOOL_NAMES as readonly string[]).includes('delete_campaign'),
} as const;

const READ_CAPABILITY_LABELS: Partial<Record<OperatorToolName, string>> = {
  search_leads: 'trovare e confrontare lead',
  get_lead_detail: 'analizzare attività e siti',
  get_blockers: 'spiegare blocker',
  get_daily_report: 'leggere performance e report',
  get_dashboard_summary: 'leggere performance e report',
  get_campaign_stats: 'leggere performance e report',
  list_campaigns: 'leggere e aprire campagne',
  get_campaign_detail: 'leggere e aprire campagne',
  list_review_items: 'leggere la Review',
  list_conversations: 'leggere e gestire conversazioni commerciali',
  get_conversation: 'leggere e gestire conversazioni commerciali',
};

const WRITE_NOW_LABELS: Partial<Record<string, string>> = {
  create_campaign: 'creare e preparare campagne TEST',
  prepare_campaign: 'generare demo e messaggi',
  pause_campaign: 'gestire campagne attraverso azioni autorizzate',
  resume_campaign: 'gestire campagne attraverso azioni autorizzate',
};

const CONFIRM_LABELS: Record<(typeof OPERATOR_CONFIRM_TOOLS)[number], string> = {
  send_campaign: 'inviare campagne (email/Telegram) dopo conferma esplicita',
  enable_autonomy: 'proporti azioni automatiche secondo il Commercial Playbook',
};

const HUMAN_LABELS: Record<(typeof DENIED_TOOL_NAMES)[number], string> = {
  sql_query: 'query SQL dirette sul database',
  fetch_url: 'chiamate HTTP arbitrarie',
  send_email: 'invio email saltando Send Guard',
  send_telegram: 'invio Telegram saltando Send Guard',
  delete_lead: 'cancellazione lead',
};

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export function registeredReadCapabilities(): string[] {
  return unique(
    OPERATOR_TOOL_NAMES.map((name) => READ_CAPABILITY_LABELS[name]).filter(
      (label): label is string => Boolean(label),
    ),
  );
}

export function registeredNowWriteCapabilities(): string[] {
  return unique(
    WRITE_TOOL_NAMES.filter((name) => !(DENIED_TOOL_NAMES as readonly string[]).includes(name))
      .map((name) => WRITE_NOW_LABELS[name])
      .filter((label): label is string => Boolean(label)),
  );
}

export function registeredConfirmCapabilities(): string[] {
  const items = OPERATOR_CONFIRM_TOOLS.map((name) => CONFIRM_LABELS[name]);
  if (CAMPAIGN_MUTATION_CAPABILITIES.hardDelete) {
    items.push('eliminare definitivamente una campagna dopo conferma esplicita');
  }
  return unique(items);
}

export function registeredHumanCapabilities(): string[] {
  const items = unique(DENIED_TOOL_NAMES.map((name) => HUMAN_LABELS[name]));
  if (!CAMPAIGN_MUTATION_CAPABILITIES.hardDelete) {
    items.push('eliminazione definitiva delle campagne (non disponibile: usa pausa)');
  }
  return items;
}

export function buildOperatorCapabilityReply(mode: OperatorAssistMode = 'ASSISTITO'): {
  reply: string;
  now: string[];
  confirm: string[];
  human: string[];
} {
  const now = unique([...registeredNowWriteCapabilities(), ...registeredReadCapabilities()]);
  const confirm = registeredConfirmCapabilities();
  const human = registeredHumanCapabilities();
  const modeLine =
    mode === 'AUTO_CONTROLLATO'
      ? 'Modalità AUTO CONTROLLATO: le azioni esterne restano confermate; il playbook può proporre risposte automatiche già autorizzate.'
      : 'Modalità ASSISTITO: leggo i dati e preparo azioni; gli invii restano confermati da te.';
  const list = (title: string, rows: string[]) =>
    `${title}\n${rows.map((row) => `- ${row}`).join('\n')}`;
  const reply = [
    'Posso aiutarti a:',
    ...now.map((row) => `- ${row}`),
    '',
    list('Posso fare ora', now),
    '',
    list('Richiede conferma', confirm),
    '',
    list('Richiede intervento umano', human),
    '',
    modeLine,
  ].join('\n');
  return { reply, now, confirm, human };
}
