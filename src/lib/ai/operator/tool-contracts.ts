/**
 * Contratto di esecuzione per tool chat Attila.
 * READ/INTERNAL → subito; CONFIRM_* → pending + click umano; DENIED → mai.
 */

export type ExecutionTier =
  | 'READ'
  | 'INTERNAL'
  | 'CONFIRM_EXTERNAL'
  | 'CONFIRM_IRREVERSIBLE'
  | 'DENIED';

export type ToolContract = {
  name: string;
  tier: ExecutionTier;
  label: string;
  humanConfirmLabel?:
    | 'Conferma invio'
    | 'Abilita policy'
    | 'Metti in pausa'
    | 'Conferma azione'
    | 'Conferma risposta';
  auditPropose?: string;
  auditExecute?: string;
};

export const TOOL_CONTRACTS: Record<string, ToolContract> = {
  get_dashboard_summary: { name: 'get_dashboard_summary', tier: 'READ', label: 'riepilogo dashboard' },
  search_leads: { name: 'search_leads', tier: 'READ', label: 'cerca lead' },
  get_lead_detail: { name: 'get_lead_detail', tier: 'READ', label: 'dettaglio lead' },
  list_campaigns: { name: 'list_campaigns', tier: 'READ', label: 'lista campagne' },
  get_campaign_detail: { name: 'get_campaign_detail', tier: 'READ', label: 'dettaglio campagna' },
  get_campaign_stats: { name: 'get_campaign_stats', tier: 'READ', label: 'stats campagna' },
  get_blockers: { name: 'get_blockers', tier: 'READ', label: 'blocker' },
  list_review_items: { name: 'list_review_items', tier: 'READ', label: 'review' },
  get_daily_report: { name: 'get_daily_report', tier: 'READ', label: 'report giornaliero' },
  get_daily_briefing: {
    name: 'get_daily_briefing',
    tier: 'READ',
    label: 'briefing commerciale di oggi',
  },
  get_commercial_insights: {
    name: 'get_commercial_insights',
    tier: 'READ',
    label: 'apprendimento e consigli commerciali',
  },
  list_conversations: { name: 'list_conversations', tier: 'READ', label: 'conversazioni' },
  get_conversation: { name: 'get_conversation', tier: 'READ', label: 'dettaglio conversazione' },
  get_telegram_inbound_status: {
    name: 'get_telegram_inbound_status',
    tier: 'READ',
    label: 'stato Telegram',
  },
  list_templates: { name: 'list_templates', tier: 'READ', label: 'template' },
  list_demos: { name: 'list_demos', tier: 'READ', label: 'demo' },
  inspect_demo: { name: 'inspect_demo', tier: 'READ', label: 'ispeziona demo' },
  inspect_template: { name: 'inspect_template', tier: 'READ', label: 'ispeziona template' },
  list_calendar_events: { name: 'list_calendar_events', tier: 'READ', label: 'eventi calendario' },
  list_available_slots: { name: 'list_available_slots', tier: 'READ', label: 'slot disponibili' },
  get_calendar_summary: { name: 'get_calendar_summary', tier: 'READ', label: 'riepilogo calendario' },

  create_campaign: { name: 'create_campaign', tier: 'INTERNAL', label: 'crea campagna' },
  prepare_campaign: { name: 'prepare_campaign', tier: 'INTERNAL', label: 'prepara campagna' },
  resume_campaign: { name: 'resume_campaign', tier: 'INTERNAL', label: 'riprendi campagna' },
  personalize_demo: { name: 'personalize_demo', tier: 'INTERNAL', label: 'personalizza demo' },
  apply_demo_personalization: {
    name: 'apply_demo_personalization',
    tier: 'INTERNAL',
    label: 'applica testi demo',
  },
  update_commercial_playbook: {
    name: 'update_commercial_playbook',
    tier: 'INTERNAL',
    label: 'aggiorna regole commerciali',
    auditExecute: 'execute_playbook_update',
  },
  take_over_thread: { name: 'take_over_thread', tier: 'INTERNAL', label: 'prendi in carico' },
  return_to_ai: { name: 'return_to_ai', tier: 'INTERNAL', label: 'ridai ad Attila' },
  create_calendar_slot: { name: 'create_calendar_slot', tier: 'INTERNAL', label: 'crea disponibilità' },
  reschedule_appointment: {
    name: 'reschedule_appointment',
    tier: 'INTERNAL',
    label: 'riprogramma appuntamento',
  },

  send_campaign: {
    name: 'send_campaign',
    tier: 'CONFIRM_EXTERNAL',
    label: 'invia campagna',
    humanConfirmLabel: 'Conferma invio',
    auditPropose: 'propose_send',
    auditExecute: 'execute_send',
  },
  reply_telegram: {
    name: 'reply_telegram',
    tier: 'INTERNAL',
    label: 'rispondi su Telegram',
    auditPropose: 'propose_telegram_reply',
    auditExecute: 'execute_telegram_reply',
  },

  pause_campaign: {
    name: 'pause_campaign',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'metti in pausa campagna',
    humanConfirmLabel: 'Metti in pausa',
    auditPropose: 'propose_pause',
    auditExecute: 'execute_pause',
  },
  enable_autonomy: {
    name: 'enable_autonomy',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'abilita autonomia',
    humanConfirmLabel: 'Abilita policy',
    auditPropose: 'propose_autonomy',
    auditExecute: 'execute_autonomy',
  },
  cancel_appointment: {
    name: 'cancel_appointment',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'annulla appuntamento',
    humanConfirmLabel: 'Conferma azione',
    auditPropose: 'propose_cancel_appointment',
    auditExecute: 'execute_cancel_appointment',
  },
  stop_automation: {
    name: 'stop_automation',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'ferma automazione',
    humanConfirmLabel: 'Conferma azione',
    auditPropose: 'propose_stop_automation',
    auditExecute: 'execute_stop_automation',
  },
  set_telegram_runtime: {
    name: 'set_telegram_runtime',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'avvia/ferma Telegram',
    humanConfirmLabel: 'Conferma azione',
    auditPropose: 'propose_telegram_runtime',
    auditExecute: 'execute_telegram_runtime',
  },

  send_email: { name: 'send_email', tier: 'DENIED', label: 'invio email diretto' },
  send_telegram: { name: 'send_telegram', tier: 'DENIED', label: 'invio Telegram diretto' },
  sql_query: { name: 'sql_query', tier: 'DENIED', label: 'query SQL' },
  fetch_url: { name: 'fetch_url', tier: 'DENIED', label: 'fetch URL' },
  delete_lead: { name: 'delete_lead', tier: 'DENIED', label: 'cancella lead' },
  delete_campaign: { name: 'delete_campaign', tier: 'DENIED', label: 'cancella campagna' },
};

export function getToolContract(name: string): ToolContract | null {
  return TOOL_CONTRACTS[name] ?? null;
}

export function isConfirmTier(tier: ExecutionTier): boolean {
  return tier === 'CONFIRM_EXTERNAL' || tier === 'CONFIRM_IRREVERSIBLE';
}

export function contractsByTier(...tiers: ExecutionTier[]): ToolContract[] {
  return Object.values(TOOL_CONTRACTS).filter((c) => tiers.includes(c.tier));
}
