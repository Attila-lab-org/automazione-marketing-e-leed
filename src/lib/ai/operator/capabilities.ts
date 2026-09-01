import {
  DENIED_TOOL_NAMES,
  OPERATOR_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  type OperatorToolName,
} from './registry';
import { contractsByTier, TOOL_CONTRACTS } from './tool-contracts';

export const HARD_DELETE_FOLLOWUP = 'eliminala definitivamente';

export type OperatorAssistMode = 'ASSISTITO' | 'AUTO_CONTROLLATO';

export const OPERATOR_CONFIRM_TOOLS = [
  'send_campaign',
  'enable_autonomy',
  'pause_campaign',
  'archive_campaign',
  'cancel_appointment',
  'stop_automation',
  'set_telegram_runtime',
] as const;

export const CAMPAIGN_MUTATION_CAPABILITIES = {
  pause: (WRITE_TOOL_NAMES as readonly string[]).includes('pause_campaign'),
  resume: (WRITE_TOOL_NAMES as readonly string[]).includes('resume_campaign'),
  archive: (WRITE_TOOL_NAMES as readonly string[]).includes('archive_campaign'),
  hardDelete: (WRITE_TOOL_NAMES as readonly string[]).includes('delete_campaign'),
} as const;

const READ_CAPABILITY_LABELS: Partial<Record<OperatorToolName, string>> = {
  search_leads: 'trovare e confrontare contatti',
  get_lead_detail: 'analizzare attività e siti',
  get_blockers: 'spiegare cosa blocca un invio',
  get_daily_report: 'leggere performance e report',
  get_dashboard_summary: 'leggere performance e report',
  get_campaign_stats: 'leggere performance e report',
  list_campaigns: 'leggere e aprire campagne',
  get_campaign_detail: 'leggere e aprire campagne',
  list_review_items: 'leggere la Review',
  list_conversations: 'leggere e gestire conversazioni commerciali',
  get_conversation: 'leggere e gestire conversazioni commerciali',
  get_telegram_inbound_status: 'spiegare il monitoraggio Telegram inbound',
  list_templates: 'ispezionare template e demo',
  list_demos: 'ispezionare template e demo',
  inspect_demo: 'ispezionare template e demo',
  inspect_template: 'ispezionare template e demo',
  list_calendar_events: 'leggere appuntamenti dal calendario',
  list_available_slots: 'leggere disponibilità in calendario',
  get_calendar_summary: 'contare e riepilogare appuntamenti fissati',
};

const WRITE_NOW_LABELS: Partial<Record<string, string>> = {
  create_campaign: 'creare e preparare campagne TEST',
  prepare_campaign: 'generare demo e messaggi',
  resume_campaign: 'riprendere campagne in pausa',
  personalize_demo: 'personalizzare testi demo (headline, CTA, tono)',
  apply_demo_personalization: 'applicare personalizzazioni demo già proposte',
  take_over_thread: 'prendere in carico una conversazione',
  return_to_ai: 'ridare una conversazione ad Attila',
  close_won: 'chiudere un cliente pagato e toglierlo dalle code',
  archive_thread: 'archiviare una conversazione se non rispondi',
  drop_thread: 'cancellare una conversazione dalle code aperte',
  dismiss_todo: 'togliere un follow-up dalla coda',
  create_calendar_slot: 'aggiungere disponibilità in calendario',
  reschedule_appointment: 'riprogrammare un appuntamento su slot liberi',
  reply_telegram: 'rispondere subito all’ultimo Telegram in attesa',
};

const CONFIRM_LABELS: Record<string, string> = {
  send_campaign: 'inviare campagne (email/Telegram) dopo conferma esplicita',
  enable_autonomy: 'abilitare autonomia secondo il Commercial Playbook',
  pause_campaign: 'mettere in pausa una campagna dopo conferma',
  archive_campaign: 'archiviare o nascondere un invio dopo conferma (le email già partite restano)',
  cancel_appointment: 'annullare un appuntamento dopo conferma',
  stop_automation: 'fermare l’automazione su un contatto dopo conferma',
  set_telegram_runtime: 'avviare o fermare il bot Telegram dopo conferma',
};

const HUMAN_LABELS: Record<(typeof DENIED_TOOL_NAMES)[number], string> = {
  sql_query: 'query SQL dirette sul database',
  fetch_url: 'chiamate HTTP arbitrarie',
  send_email: 'invio email saltando Send Guard',
  send_telegram: 'invio Telegram saltando Send Guard',
  delete_lead: 'cancellazione contatti',
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
    contractsByTier('INTERNAL')
      .map((c) => WRITE_NOW_LABELS[c.name] ?? c.label)
      .filter(Boolean),
  );
}

export function registeredConfirmCapabilities(): string[] {
  const items = OPERATOR_CONFIRM_TOOLS.map((name) => CONFIRM_LABELS[name]).filter(Boolean);
  if (CAMPAIGN_MUTATION_CAPABILITIES.hardDelete) {
    items.push('eliminare definitivamente una campagna dopo conferma esplicita');
  }
  return unique(items);
}

export function registeredHumanCapabilities(): string[] {
  const items = unique(DENIED_TOOL_NAMES.map((name) => HUMAN_LABELS[name]));
  if (!CAMPAIGN_MUTATION_CAPABILITIES.hardDelete) {
    items.push('eliminazione definitiva delle campagne (non disponibile: archivia o nascondi l’invio)');
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
      : 'Modalità ASSISTITO: leggo i dati e preparo azioni; invii, cancellazioni e stop irreversibili restano confermati da te.';
  const list = (title: string, rows: string[]) =>
    `${title}\n${rows.map((row) => `- ${row}`).join('\n')}`;
  const reply = [
    'Posso gestire il commerciale da questa chat (contatti, invii, messaggi, Telegram, calendario, anteprime):',
    '',
    list('Posso fare ora', now),
    '',
    list('Richiede conferma', confirm),
    '',
    list('Richiede intervento umano', human),
    '',
    'Esempi: «quanti appuntamenti ho?», «rispondi a telegram», «prendi in carico», «aggiungi disponibilità domani alle 15:00», «riprogramma appuntamento».',
    '',
    modeLine,
  ].join('\n');
  void TOOL_CONTRACTS;
  return { reply, now, confirm, human };
}
