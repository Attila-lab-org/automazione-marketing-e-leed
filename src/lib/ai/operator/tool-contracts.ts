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
    | 'Archivia invio'
    | 'Nascondi invio'
    | 'Conferma azione'
    | 'Conferma risposta'
    | 'Sì, accendi Telegram'
    | 'Sì, spegni Telegram';
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
  get_blockers: { name: 'get_blockers', tier: 'READ', label: 'problemi aperti' },
  list_review_items: { name: 'list_review_items', tier: 'READ', label: 'review' },
  get_daily_report: { name: 'get_daily_report', tier: 'READ', label: 'report giornaliero' },
  get_security_report: { name: 'get_security_report', tier: 'READ', label: 'report sicurezza' },
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
  get_active_commercial_goal: {
    name: 'get_active_commercial_goal',
    tier: 'READ',
    label: 'obiettivo commerciale attivo',
  },
  get_commercial_goal_plan: {
    name: 'get_commercial_goal_plan',
    tier: 'READ',
    label: 'piano dell’obiettivo commerciale',
  },

  create_campaign: { name: 'create_campaign', tier: 'INTERNAL', label: 'crea campagna' },
  create_commercial_goal: {
    name: 'create_commercial_goal',
    tier: 'INTERNAL',
    label: 'crea obiettivo commerciale',
  },
  update_commercial_goal: {
    name: 'update_commercial_goal',
    tier: 'INTERNAL',
    label: 'aggiorna obiettivo commerciale',
  },
  pause_commercial_goal: {
    name: 'pause_commercial_goal',
    tier: 'INTERNAL',
    label: 'metti in pausa obiettivo commerciale',
  },
  resume_commercial_goal: {
    name: 'resume_commercial_goal',
    tier: 'INTERNAL',
    label: 'riprendi obiettivo commerciale',
  },
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
  update_telegram_keywords: {
    name: 'update_telegram_keywords',
    tier: 'INTERNAL',
    label: 'aggiorna parole chiave Telegram',
    auditExecute: 'execute_telegram_keywords',
  },
  list_manual_followups: {
    name: 'list_manual_followups',
    tier: 'INTERNAL',
    label: 'mostra follow-up da approvare',
  },
  take_over_thread: { name: 'take_over_thread', tier: 'INTERNAL', label: 'prendi in carico' },
  return_to_ai: { name: 'return_to_ai', tier: 'INTERNAL', label: 'ridai ad Attila' },
  close_won: { name: 'close_won', tier: 'INTERNAL', label: 'chiudi cliente pagato' },
  archive_thread: { name: 'archive_thread', tier: 'INTERNAL', label: 'archivia conversazione' },
  archive_all_threads: {
    name: 'archive_all_threads',
    tier: 'INTERNAL',
    label: 'archivia tutte le conversazioni',
  },
  drop_thread: { name: 'drop_thread', tier: 'INTERNAL', label: 'togli conversazione dalle code' },
  dismiss_todo: { name: 'dismiss_todo', tier: 'INTERNAL', label: 'togli attività dalla coda' },
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
  archive_campaign: {
    name: 'archive_campaign',
    tier: 'CONFIRM_IRREVERSIBLE',
    label: 'archivia campagna',
    humanConfirmLabel: 'Archivia invio',
    auditPropose: 'propose_archive',
    auditExecute: 'execute_archive',
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

export type GoalExecutionDecision = {
  decision: 'ALLOW' | 'SHADOW' | 'CONFIRM' | 'DENY';
  reason: string;
};

export function resolveGoalScopedExecution(input: {
  mode: 'ASK' | 'DO' | 'AUTOPILOT';
  tier: ExecutionTier;
  autonomyActive: boolean;
  sendGuardReady: boolean;
  withinDailyLimit: boolean;
  shadowMode: boolean;
  escalation: boolean;
}): GoalExecutionDecision {
  if (input.tier === 'DENIED' || input.escalation) {
    return { decision: 'DENY', reason: input.escalation ? 'HUMAN_ESCALATION' : 'TOOL_DENIED' };
  }
  if (input.mode === 'ASK') {
    return input.tier === 'READ'
      ? { decision: 'ALLOW', reason: 'ASK_READ' }
      : { decision: 'SHADOW', reason: 'ASK_NO_WRITES' };
  }
  if (input.tier === 'READ' || input.tier === 'INTERNAL') {
    return input.shadowMode
      ? { decision: 'SHADOW', reason: 'SHADOW_MODE' }
      : { decision: 'ALLOW', reason: 'INTERNAL_ALLOWED' };
  }
  if (input.mode === 'DO') return { decision: 'CONFIRM', reason: 'DO_EXTERNAL_CONFIRMATION' };
  if (input.shadowMode) return { decision: 'SHADOW', reason: 'SHADOW_MODE' };
  if (!input.autonomyActive) return { decision: 'CONFIRM', reason: 'AUTONOMY_NOT_ACTIVE' };
  if (!input.sendGuardReady) return { decision: 'DENY', reason: 'SEND_GUARD_NOT_READY' };
  if (!input.withinDailyLimit) return { decision: 'DENY', reason: 'DAILY_LIMIT_REACHED' };
  return { decision: 'ALLOW', reason: 'AUTOPILOT_POLICY_GREEN' };
}
