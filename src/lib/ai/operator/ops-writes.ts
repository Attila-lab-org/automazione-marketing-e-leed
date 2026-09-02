import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { WriteResult } from './writes';
import { recordAiAudit } from './writes';
import { createPendingAction } from './pending';
import { getToolContract, isConfirmTier } from './tool-contracts';
import { formatEuropeRome, parseEuropeRomeDateTime } from './time';
import { isBulkConversationArchive } from './intent';
import { resumeTelegramAiAndReply, replyLatestPendingTelegram } from '@/lib/inbound/telegram-resume';
import {
  cancelAppointment,
  createAvailabilitySlot,
  getActiveAppointmentForLead,
  rescheduleAppointment,
} from '@/lib/calendar';
import {
  getTelegramInboundSettings,
  saveTelegramInboundSettings,
  type TelegramKeywordGroups,
} from '@/lib/inbound/telegram-settings';
import {
  getTelegramCredentialStatus,
  registerTelegramWebhook,
  unregisterTelegramWebhook,
} from '@/lib/providers/telegram/webhook';
import { stopLeadSequences } from '@/lib/sales/stop';
import {
  archiveOpenThreadsWork,
  closeOutLeadWork,
  closeOutSummary,
  type CloseOutKind,
} from '@/lib/sales/close-out';
import { getCurrentPlaybook, saveCurrentPlaybook } from '@/lib/sales/playbook-store';
import type { CommercialPlaybook, ResponseMode } from '@/lib/sales/playbook';

export type OperatorOpsAction =
  | 'reply_telegram'
  | 'take_over'
  | 'return_to_ai'
  | 'stop_automation'
  | 'close_won'
  | 'archive_thread'
  | 'archive_all_threads'
  | 'drop_thread'
  | 'dismiss_todo'
  | 'create_slot'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  | 'start_telegram'
  | 'stop_telegram'
  | 'set_telegram_auto'
  | 'set_telegram_manual'
  | 'update_telegram_keywords'
  | 'list_manual_followups'
  | 'update_playbook'
  | 'none';

export type OperatorOpsContext = { entityType?: string | null; route?: string | null };

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:telegeram|telegramm+|telgram|telegran|telegam)\b/g, 'telegram')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTelegramKeywordCommand(question: string): {
  group: keyof TelegramKeywordGroups;
  groupLabel: string;
  keyword: string;
} | null {
  const raw = question.trim();
  const quoted =
    raw.match(
      /aggiungi\s+[«"']([^»"']+)[»"']\s+(?:alle|ai|a)\s+(?:parole\s+chiave\s+)?(.+)$/i,
    ) ??
    raw.match(/aggiungi\s+(.+?)\s+(?:alle|ai|a)\s+parole\s+chiave\s+(.+)$/i) ??
    raw.match(/aggiungi\s+(.+?)\s+(?:alle|ai|a)\s+(siti\s+web|ecommerce|e-?commerce|presenza(?:\s+online)?|preventivi?)/i);
  if (!quoted) return null;
  const keyword = quoted[1]?.trim().replace(/^["'«]+|["'»]+$/g, '').slice(0, 80);
  const groupRaw = norm(quoted[2] ?? '');
  if (!keyword) return null;
  let group: keyof TelegramKeywordGroups = 'website';
  let groupLabel = 'siti web';
  if (/e-?commerce|negozio|shop/.test(groupRaw)) {
    group = 'ecommerce';
    groupLabel = 'e-commerce';
  } else if (/presenza|digital|visibilit|google/.test(groupRaw)) {
    group = 'digitalPresence';
    groupLabel = 'presenza online';
  } else if (/preventiv|prezzo|fornitor|quanto\s+costa|quote/.test(groupRaw)) {
    group = 'quote';
    groupLabel = 'preventivi';
  } else if (/sito|web|landing|restyling/.test(groupRaw) || groupRaw.includes('siti')) {
    group = 'website';
    groupLabel = 'siti web';
  }
  return { group, groupLabel, keyword };
}

export async function listDueManualFollowups(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<
  Array<{
    campaignLeadId: string;
    campaignId: string;
    campaignName: string;
    leadName: string;
    sequenceStep: number;
    nextActionAt: string | null;
    status: string;
  }>
> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from('campaign_leads')
    .select('id, campaign_id, lead_id, sequence_step, next_action_at, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['SENT', 'REVIEW'])
    .gte('sequence_step', 1)
    .lte('next_action_at', nowIso)
    .order('next_action_at', { ascending: true })
    .limit(30);
  if (!rows?.length) return [];

  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    admin.from('leads').select('id, name').in('id', leadIds),
    admin.from('campaigns').select('id, name').in('id', campaignIds),
  ]);
  const leadById = new Map((leads ?? []).map((l) => [l.id, l.name]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  const filtered: Array<{
    campaignLeadId: string;
    campaignId: string;
    campaignName: string;
    leadName: string;
    sequenceStep: number;
    nextActionAt: string | null;
    status: string;
  }> = [];

  for (const row of rows) {
    const { count: replies } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('lead_id', row.lead_id)
      .eq('direction', 'INBOUND');
    if ((replies ?? 0) > 0) continue;
    filtered.push({
      campaignLeadId: row.id,
      campaignId: row.campaign_id,
      campaignName: campaignById.get(row.campaign_id) ?? 'Campagna',
      leadName: leadById.get(row.lead_id) ?? 'Contatto',
      sequenceStep: row.sequence_step ?? 1,
      nextActionAt: row.next_action_at,
      status: row.status,
    });
  }
  return filtered;
}

export function extractNamedLeadHint(question: string): string | null {
  const raw = question.trim();
  const patterns = [
    /\b(?:cliente|contatto)\s+([^,.;!?]+?)(?=\s+(?:ho|ha|e|è|chiuso|pagato|archivi|cancell|elimin|non|inviato|mandato|togl)|[,.;]|$)/i,
    /\b(?:archivia|cancella|elimina)\s+(?:il |la |lo )?(?:cliente |contatto )?([^,.;!?]+)$/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const hint = match?.[1]?.trim().replace(/^["«]+|["»]+$/g, '');
    if (
      hint &&
      hint.length >= 2 &&
      hint.length <= 80 &&
      !/^(campagn|conversaz|chat|thread|invio|questa|quella|tutte|tutti|tutto|ogni)\b/i.test(hint) &&
      !/\b(conversaz|chat|thread|messagg)/i.test(hint)
    ) {
      return hint;
    }
  }
  return null;
}

function isCampaignScopedClose(q: string): boolean {
  return /campagn|invii email|questo invio|questa campagna/.test(q);
}

export function detectOperatorOpsAction(
  question: string,
  ctx?: OperatorOpsContext,
): OperatorOpsAction {
  const q = norm(question);
  if (
    /(aggiungi|metti|inserisci).{0,40}(parol|keyword)/.test(q) ||
    /(parol|keyword).{0,40}(siti web|ecommerce|e commerce|presenza|preventiv)/.test(q)
  ) {
    return 'update_telegram_keywords';
  }
  if (
    /(mostrami|mostra|elenca|lista|quali).{0,24}follow.?up/.test(q) ||
    /follow.?up.{0,24}(approvare|da controllare|in coda|manual)/.test(q)
  ) {
    return 'list_manual_followups';
  }
  if (
    /(modalita|modo) (autonom|equilibrat|assistit)/.test(q) ||
    /prezzo (minimo|standard|massimo)/.test(q) ||
    /sconto massimo/.test(q) ||
    /(imposta|cambia|usa).{0,12}tono/.test(q) ||
    /tono consulenzial/.test(q) ||
    /non proporre.{0,20}chiamat/.test(q) ||
    /interesse esplicit/.test(q) ||
    /durata.{0,12}(chiamata|call)/.test(q) ||
    /non comunicare.{0,8}prezz/.test(q)
  ) {
    return 'update_playbook';
  }
  if (
    q.includes('telegram') &&
    (q.includes('rispond') || q.includes('reply') || q.includes('manda risposta'))
  ) {
    return 'reply_telegram';
  }
  if (
    q.includes('prendi in carico') ||
    q.includes('gestisci tu') ||
    q.includes('takeover') ||
    (q.includes('gestione manuale') && !q.includes('telegram'))
  ) {
    return 'take_over';
  }
  if (
    q.includes('ridai') ||
    q.includes('attiva attila') ||
    q.includes('ritorna all ai') ||
    q.includes('return to ai') ||
    q.includes('riattiva attila')
  ) {
    return 'return_to_ai';
  }
  if (
    (q.includes('ferma') || q.includes('chiudi')) &&
    (q.includes('automazione') || q.includes('conversazione'))
  ) {
    return 'stop_automation';
  }
  if (
    (q.includes('aggiungi') || q.includes('crea')) &&
    (q.includes('slot') || q.includes('disponibilit'))
  ) {
    return 'create_slot';
  }
  if (q.includes('annulla') && (q.includes('appuntamento') || q.includes('chiamata') || q.includes('demo'))) {
    return 'cancel_appointment';
  }
  if (
    q.includes('riprogramma') ||
    (q.includes('sposta') && (q.includes('appuntamento') || q.includes('chiamata')))
  ) {
    return 'reschedule_appointment';
  }
  if (
    q.includes('telegram') &&
    (q.includes('automatico protetto') ||
      q.includes('auto protetto') ||
      (q.includes('automatico') && !q.includes('ferma')))
  ) {
    return 'set_telegram_auto';
  }
  if (
    q.includes('telegram') &&
    (q.includes('gestione manuale') || q.includes('modo manuale') || q.includes('manuale'))
  ) {
    return 'set_telegram_manual';
  }
  if (
    (q.includes('avvia') || q.includes('accendi') || q.includes('parti')) &&
    q.includes('telegram')
  ) {
    return 'start_telegram';
  }
  if (
    (q.includes('ferma') || q.includes('spegni') || q.includes('disattiva')) &&
    q.includes('telegram') &&
    !q.includes('rispond')
  ) {
    return 'stop_telegram';
  }
  if (isCampaignScopedClose(q) && /(cancell|elimin|archivi|nascond)/.test(q)) {
    return 'none';
  }
  if (isBulkConversationArchive(question, ctx)) {
    return 'archive_all_threads';
  }
  if (
    /(chiuso e pagato|chiuso pagato|ha pagato|cliente chiuso|vendita chiusa|contratto chiuso|deal chiuso|trattativa chiusa|\bvinto\b|ho chiuso (il |la )?(cliente|trattativa|affare|deal))/.test(
      q,
    ) &&
    !/automazione|campagn/.test(q)
  ) {
    return 'close_won';
  }
  if (
    /(togli|rimuovi|segna).{0,18}(coda|todo|attivita|follow.?up)|segna come fatto|toglila dalla coda/.test(
      q,
    )
  ) {
    return 'dismiss_todo';
  }
  const conversationDelete = /(cancell|elimin).{0,24}(conversaz|chat|thread)/.test(q);
  const conversationArchive =
    /non rispondo|non risponde|non voglio rispondere|lascia perdere/.test(q) ||
    (/archivia/.test(q) && /(conversaz|chat|cliente|contatto|questa|quella)/.test(q));
  if ((conversationDelete || conversationArchive) && !isCampaignScopedClose(q)) {
    if (conversationDelete && !conversationArchive) return 'drop_thread';
    return 'archive_thread';
  }
  if (
    (ctx?.entityType === 'thread' || ctx?.entityType === 'lead') &&
    /(cancell|elimin|archivi|non rispondo|non risponde|lascia perdere)/.test(q) &&
    !isCampaignScopedClose(q)
  ) {
    return /archivi|non rispondo|non risponde|lascia perdere/.test(q)
      ? 'archive_thread'
      : 'drop_thread';
  }
  return 'none';
}

const OPS_TOOL_BY_ACTION: Record<Exclude<OperatorOpsAction, 'none'>, string> = {
  reply_telegram: 'reply_telegram',
  take_over: 'take_over_thread',
  return_to_ai: 'return_to_ai',
  stop_automation: 'stop_automation',
  close_won: 'close_won',
  archive_thread: 'archive_thread',
  archive_all_threads: 'archive_all_threads',
  drop_thread: 'drop_thread',
  dismiss_todo: 'dismiss_todo',
  create_slot: 'create_calendar_slot',
  cancel_appointment: 'cancel_appointment',
  reschedule_appointment: 'reschedule_appointment',
  start_telegram: 'set_telegram_runtime',
  stop_telegram: 'set_telegram_runtime',
  set_telegram_auto: 'set_telegram_runtime',
  set_telegram_manual: 'set_telegram_runtime',
  update_telegram_keywords: 'update_telegram_keywords',
  list_manual_followups: 'list_manual_followups',
  update_playbook: 'update_commercial_playbook',
};

export type ThreadTarget = { threadId: string; leadId: string; channel: string; ambiguous?: boolean };

async function findLeadsByNameHint(
  admin: AppSupabaseClient,
  workspaceId: string,
  hint: string,
): Promise<Array<{ id: string; name: string }>> {
  const cleaned = hint.replace(/[%_]/g, '').slice(0, 80);
  if (!cleaned) return [];
  const { data } = await admin
    .from('leads')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .ilike('name', `%${cleaned}%`)
    .limit(5);
  return data ?? [];
}

async function resolveCloseOutTarget(
  admin: AppSupabaseClient,
  workspaceId: string,
  refs: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null },
  question: string,
): Promise<
  | { leadId: string; threadId: string | null }
  | { needsContext: true; summary: string }
> {
  const hint = extractNamedLeadHint(question);
  const direct = await resolveThreadTarget(admin, workspaceId, refs);
  if (direct && !('needsContext' in direct)) {
    return { leadId: direct.leadId, threadId: direct.threadId };
  }
  if (hint) {
    const found = await findLeadsByNameHint(admin, workspaceId, hint);
    if (found.length > 1) {
      return {
        needsContext: true,
        summary: `Quale contatto intendi: ${found.map((row) => `«${row.name}»`).join(', ')}?`,
      };
    }
    if (found.length === 1) {
      const thread = await resolveThreadTarget(admin, workspaceId, { lastLeadId: found[0].id });
      if (thread && !('needsContext' in thread)) {
        return { leadId: thread.leadId, threadId: thread.threadId };
      }
      return { leadId: found[0].id, threadId: null };
    }
    return {
      needsContext: true,
      summary: `Non trovo «${hint}». Apri il contatto in Messaggi o dimmi il nome esatto.`,
    };
  }
  return {
    needsContext: true,
    summary:
      'Apri la conversazione o dimmi il cliente. Esempio: «cliente Da Mario chiuso e pagato» oppure «non rispondo, archivia».',
  };
}

/** Risolve il target: mai fallback silenzioso all’ultimo Telegram globale. */
export async function resolveThreadTarget(
  admin: AppSupabaseClient,
  workspaceId: string,
  refs: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null },
): Promise<ThreadTarget | null | { needsContext: true; summary: string }> {
  if (refs.lastThreadId) {
    const { data } = await admin
      .from('message_threads')
      .select('id, lead_id, channel')
      .eq('workspace_id', workspaceId)
      .eq('id', refs.lastThreadId)
      .maybeSingle();
    if (data) return { threadId: data.id, leadId: data.lead_id, channel: data.channel };
  }
  if (refs.lastLeadId) {
    const { data } = await admin
      .from('message_threads')
      .select('id, lead_id, channel')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', refs.lastLeadId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { threadId: data.id, leadId: data.lead_id, channel: data.channel };
  }
  if (refs.lastEventId) {
    const { data: event } = await admin
      .from('calendar_events')
      .select('lead_id, thread_id')
      .eq('workspace_id', workspaceId)
      .eq('id', refs.lastEventId)
      .maybeSingle();
    if (event?.thread_id) {
      const { data } = await admin
        .from('message_threads')
        .select('id, lead_id, channel')
        .eq('id', event.thread_id)
        .maybeSingle();
      if (data) return { threadId: data.id, leadId: data.lead_id, channel: data.channel };
    }
    if (event?.lead_id) {
      const { data } = await admin
        .from('message_threads')
        .select('id, lead_id, channel')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', event.lead_id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return { threadId: data.id, leadId: data.lead_id, channel: data.channel };
    }
  }
  return {
    needsContext: true,
    summary:
      'Apri prima la conversazione in Messaggi (o il contatto nel calendario), poi ripeti il comando. Non agisco sull’ultimo Telegram a caso.',
  };
}

export async function proposeOrExecuteOps(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  action: Exclude<OperatorOpsAction, 'none'>;
  question: string;
  refs: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null };
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult> {
  const toolName = OPS_TOOL_BY_ACTION[args.action];
  const contract = getToolContract(toolName);
  if (!contract) {
    return { tool: toolName, ok: false, summary: 'Azione non supportata.', data: {} };
  }

  if (isConfirmTier(contract.tier)) {
    const preview = await buildOpsPreview(args);
    if (!preview.ok) return preview;
    if (preview.data.alreadyInRequestedState === true) return preview;
    const confirmLabel =
      args.action === 'start_telegram'
        ? 'Sì, accendi Telegram'
        : args.action === 'stop_telegram'
          ? 'Sì, spegni Telegram'
          : contract.humanConfirmLabel ?? 'Conferma azione';
    const pending = await createPendingAction(args.admin, {
      workspaceId: args.workspaceId,
      tool: toolName,
      params: preview.data,
      targetSummary: {
        action: args.action,
        preview: preview.summary,
        ...(preview.data as Record<string, unknown>),
      },
      actor: 'AI',
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: toolName,
      action: contract.auditPropose ?? 'propose',
      confirmationId: pending.id,
      result: preview.data,
    });
    return {
      tool: toolName,
      ok: true,
      summary: `${preview.summary} Conferma per procedere.`,
      data: {
        ...preview.data,
        pendingActionId: pending.id,
        needsConfirmation: true,
        confirmLabel,
      },
    };
  }

  return executeOpsActionNow(args);
}

async function buildOpsPreview(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  action: Exclude<OperatorOpsAction, 'none'>;
  question: string;
  refs: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null };
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult> {
  const env = args.env ?? process.env;

  if (args.action === 'start_telegram' || args.action === 'stop_telegram') {
    const connection = getTelegramCredentialStatus(env);
    if (args.action === 'start_telegram' && !connection.ready) {
      return {
        tool: 'set_telegram_runtime',
        ok: false,
        summary: `Telegram non è collegato. Mancano: ${connection.missing.join(', ') || 'credenziali'}.`,
        data: { missing: connection.missing },
      };
    }
    const current = await getTelegramInboundSettings(args.admin, args.workspaceId);
    if (args.action === 'start_telegram' && current.enabled) {
      return {
        tool: 'set_telegram_runtime',
        ok: true,
        summary: 'Telegram è già acceso.',
        data: { alreadyInRequestedState: true, href: '/telegram' },
      };
    }
    if (args.action === 'stop_telegram' && !current.enabled) {
      return {
        tool: 'set_telegram_runtime',
        ok: true,
        summary: 'Telegram è già spento.',
        data: { alreadyInRequestedState: true, href: '/telegram' },
      };
    }
    return {
      tool: 'set_telegram_runtime',
      ok: true,
      summary:
        args.action === 'start_telegram'
          ? 'Telegram è spento. Vuoi che lo accenda in modalità automatica protetta?'
          : 'Telegram è acceso. Vuoi che lo spenga?',
      data: { runtimeAction: args.action === 'start_telegram' ? 'start' : 'stop' },
    };
  }

  if (args.action === 'set_telegram_auto' || args.action === 'set_telegram_manual') {
    const connection = getTelegramCredentialStatus(env);
    if (!connection.ready) {
      return {
        tool: 'set_telegram_runtime',
        ok: false,
        summary: `Telegram non è collegato. Mancano: ${connection.missing.join(', ') || 'credenziali'}.`,
        data: { missing: connection.missing },
      };
    }
    return {
      tool: 'set_telegram_runtime',
      ok: true,
      summary:
        args.action === 'set_telegram_manual'
          ? 'Sto per mettere Telegram in gestione manuale (ascolta, non invia da solo).'
          : 'Sto per mettere Telegram in automatico protetto.',
      data: {
        runtimeAction: args.action === 'set_telegram_manual' ? 'manual' : 'auto',
      },
    };
  }

  if (args.action === 'reply_telegram') {
    const target = await resolveThreadTarget(args.admin, args.workspaceId, args.refs);
    if (target && 'needsContext' in target) {
      // Per reply: fallback all’ultimo inbound Telegram in attesa (esplicito nel pending)
      return {
        tool: 'reply_telegram',
        ok: true,
        summary: 'Sto per far rispondere Attila all’ultimo Telegram in attesa.',
        data: { useLatestPending: true },
      };
    }
    if (!target || target.channel !== 'TELEGRAM') {
      return {
        tool: 'reply_telegram',
        ok: false,
        summary: 'Nessuna conversazione Telegram nel contesto.',
        data: {},
      };
    }
    return {
      tool: 'reply_telegram',
      ok: true,
      summary: 'Sto per far rispondere Attila su questa conversazione Telegram.',
      data: { threadId: target.threadId, leadId: target.leadId },
    };
  }

  const target = await resolveThreadTarget(args.admin, args.workspaceId, args.refs);
  if (target && 'needsContext' in target) {
    return { tool: OPS_TOOL_BY_ACTION[args.action], ok: false, summary: target.summary, data: {} };
  }
  if (!target) {
    return {
      tool: OPS_TOOL_BY_ACTION[args.action],
      ok: false,
      summary: 'Contesto conversazione mancante.',
      data: {},
    };
  }

  if (args.action === 'stop_automation') {
    return {
      tool: 'stop_automation',
      ok: true,
      summary: 'Sto per fermare l’automazione su questa conversazione.',
      data: { threadId: target.threadId, leadId: target.leadId },
    };
  }

  if (args.action === 'cancel_appointment') {
    const appointment = await getActiveAppointmentForLead(
      args.admin,
      args.workspaceId,
      target.leadId,
    );
    if (!appointment) {
      return {
        tool: 'cancel_appointment',
        ok: false,
        summary: 'Nessun appuntamento attivo su questo contatto.',
        data: { threadId: target.threadId },
      };
    }
    return {
      tool: 'cancel_appointment',
      ok: true,
      summary: `Sto per annullare: ${appointment.title}${
        appointment.starts_at ? ` (${formatEuropeRome(appointment.starts_at)})` : ''
      }.`,
      data: {
        threadId: target.threadId,
        leadId: target.leadId,
        eventId: appointment.id,
        title: appointment.title,
        startsAt: appointment.starts_at,
      },
    };
  }

  return { tool: OPS_TOOL_BY_ACTION[args.action], ok: false, summary: 'Preview non disponibile.', data: {} };
}

export function applyPlaybookCommand(
  current: CommercialPlaybook,
  question: string,
): { playbook: CommercialPlaybook; changes: string[] } {
  const q = norm(question);
  const changes: string[] = [];
  const next = structuredClone(current);

  const setModes = (defaultMode: ResponseMode, firstReplyMode: ResponseMode, simpleFaqMode: ResponseMode) => {
    next.autonomy = { defaultMode, firstReplyMode, simpleFaqMode };
  };
  if (/(modalita|modo) autonom/.test(q)) {
    setModes('AUTO_ALLOWED', 'AUTO_ALLOWED', 'AUTO_ALLOWED');
    changes.push('modalità autonoma');
  } else if (/(modalita|modo) equilibrat/.test(q)) {
    setModes('AUTO_ALLOWED', 'APPROVAL_REQUIRED', 'AUTO_ALLOWED');
    changes.push('modalità equilibrata');
  } else if (/(modalita|modo) assistit/.test(q)) {
    setModes('APPROVAL_REQUIRED', 'APPROVAL_REQUIRED', 'APPROVAL_REQUIRED');
    changes.push('modalità assistita');
  }

  const amount = (pattern: RegExp): number | null => {
    const match = q.match(pattern);
    return match ? Number(match[1]) : null;
  };
  const minimum = amount(/prezzo minimo\s+(\d{2,6})/);
  const standard = amount(/prezzo (?:standard|massimo)\s+(\d{2,6})/);
  const discount = amount(/sconto massimo\s+(\d{1,3})/);
  if (minimum != null) {
    next.pricing = {
      ...next.pricing,
      min: minimum,
      mode: 'range',
      aiMayCommunicate: true,
    };
    next.humanEscalation.price = false;
    changes.push(`prezzo minimo ${minimum} €`);
  }
  if (standard != null) {
    next.pricing = {
      ...next.pricing,
      max: standard,
      mode: next.pricing.min === standard ? 'fixed' : 'range',
      aiMayCommunicate: true,
    };
    next.humanEscalation.price = false;
    changes.push(`prezzo standard ${standard} €`);
  }
  if (discount != null && discount >= 0 && discount <= 100) {
    next.discount = { ...next.discount, allowed: true, maxAutomatic: discount };
    next.humanEscalation.discount = false;
    changes.push(`sconto massimo ${discount}%`);
  }
  if (/non comunicare.{0,8}prezz/.test(q)) {
    next.pricing = { ...next.pricing, mode: 'hidden', aiMayCommunicate: false };
    next.discount = { ...next.discount, allowed: false };
    changes.push('prezzi nascosti');
  }

  const duration = amount(/durata.{0,12}(?:chiamata|call)(?:\s+di)?\s+(\d{1,3})/);
  if (duration != null && duration >= 5 && duration <= 180) {
    next.call = { ...next.call, durationMinutes: duration };
    changes.push(`chiamate da ${duration} minuti`);
  }

  const toneMatch = question.match(/(?:imposta|cambia|usa)(?:\s+un)?\s+tono\s+(.+)$/i);
  if (toneMatch?.[1]?.trim()) {
    const tone = toneMatch[1].trim().slice(0, 160);
    next.brand = { ...next.brand, tone };
    changes.push(`tono “${tone}”`);
  }
  if (/tono consulenzial/.test(q) || /consulenziale e non aggressiv/.test(q)) {
    next.brand = {
      ...next.brand,
      tone: 'consulenziale, concreto, non aggressivo',
    };
    changes.push('tono consulenziale');
  }
  if (
    /non proporre.{0,20}chiamat/.test(q) ||
    /interesse esplicit/.test(q) ||
    /solo dopo interesse/.test(q)
  ) {
    next.conversation = {
      ...next.conversation,
      strategy: 'consultative',
      proposeCallOnlyAfterExplicitInterest: true,
      path: ['understand_need', 'value_offer', 'propose_call'],
    };
    next.call = {
      ...next.call,
      proposeWhen:
        'Solo dopo interesse esplicito del cliente. Mai nelle prime risposte solo perché ci sono slot liberi.',
    };
    changes.push('chiamata solo dopo interesse esplicito');
  }

  return { playbook: next, changes };
}

export async function executeOpsActionNow(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  action: Exclude<OperatorOpsAction, 'none'> | string;
  question?: string;
  refs?: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null };
  params?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult> {
  const env = args.env ?? process.env;
  const action = args.action as Exclude<OperatorOpsAction, 'none'> | 'start' | 'stop';
  const refs = args.refs ?? {};
  const params = args.params ?? {};

  if (action === 'update_playbook') {
    const current = await getCurrentPlaybook(args.admin, args.workspaceId);
    const updated = applyPlaybookCommand(current, args.question ?? '');
    if (!updated.changes.length) {
      return {
        tool: 'update_commercial_playbook',
        ok: false,
        summary:
          'Non ho trovato un’impostazione valida. Esempio: “modalità autonoma, prezzo minimo 700, prezzo standard 1000, sconto massimo 15”.',
        data: {},
      };
    }
    if (
      updated.playbook.pricing.aiMayCommunicate &&
      updated.playbook.pricing.min != null &&
      updated.playbook.pricing.max != null &&
      updated.playbook.pricing.min > updated.playbook.pricing.max
    ) {
      return {
        tool: 'update_commercial_playbook',
        ok: false,
        summary: 'Non applicato: il prezzo minimo non può superare il prezzo standard.',
        data: {},
      };
    }
    const saved = await saveCurrentPlaybook(args.admin, args.workspaceId, updated.playbook);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'update_commercial_playbook',
      action: 'execute',
      result: { version: saved.version, changes: updated.changes },
    });
    return {
      tool: 'update_commercial_playbook',
      ok: true,
      summary: `Impostazioni aggiornate: ${updated.changes.join(', ')}.`,
      data: { version: saved.version, changes: updated.changes, href: '/settings/playbook' },
    };
  }

  const runtimeAction =
    action === 'start_telegram' ||
    action === 'set_telegram_auto' ||
    params.runtimeAction === 'start' ||
    params.runtimeAction === 'auto'
      ? 'auto'
      : action === 'set_telegram_manual' || params.runtimeAction === 'manual'
        ? 'manual'
        : action === 'stop_telegram' || params.runtimeAction === 'stop'
          ? 'stop'
          : null;

  if (runtimeAction) {
    const current = await getTelegramInboundSettings(args.admin, args.workspaceId);
    const connection = getTelegramCredentialStatus(env);
    if (runtimeAction === 'auto') {
      if (!connection.ready) {
        return {
          tool: 'set_telegram_runtime',
          ok: false,
          summary: `Telegram non è collegato. Mancano: ${connection.missing.join(', ') || 'credenziali'}.`,
          data: { missing: connection.missing },
        };
      }
      const webhookUrl = await registerTelegramWebhook(env);
      const settings = await saveTelegramInboundSettings(args.admin, args.workspaceId, {
        ...current,
        enabled: true,
        replyEnabled: true,
      });
      await recordAiAudit(args.admin, {
        workspaceId: args.workspaceId,
        actor: 'AI',
        tool: 'set_telegram_runtime',
        action: 'execute',
        result: { enabled: true, replyEnabled: true, mode: 'auto_guarded' },
      });
      return {
        tool: 'set_telegram_runtime',
        ok: true,
        summary: 'Telegram è in automatico protetto: risponde alle conversazioni sicure.',
        data: { enabled: settings.enabled, replyEnabled: settings.replyEnabled, webhookUrl },
      };
    }
    if (runtimeAction === 'manual') {
      if (!connection.ready && !current.enabled) {
        return {
          tool: 'set_telegram_runtime',
          ok: false,
          summary: `Telegram non è collegato. Mancano: ${connection.missing.join(', ') || 'credenziali'}.`,
          data: { missing: connection.missing },
        };
      }
      if (!current.enabled) {
        await registerTelegramWebhook(env);
      }
      const settings = await saveTelegramInboundSettings(args.admin, args.workspaceId, {
        ...current,
        enabled: true,
        replyEnabled: false,
      });
      await recordAiAudit(args.admin, {
        workspaceId: args.workspaceId,
        actor: 'AI',
        tool: 'set_telegram_runtime',
        action: 'execute',
        result: { enabled: true, replyEnabled: false, mode: 'manual' },
      });
      return {
        tool: 'set_telegram_runtime',
        ok: true,
        summary: 'Telegram è in gestione manuale: ascolta e prepara bozze, senza inviare da solo.',
        data: { enabled: settings.enabled, replyEnabled: settings.replyEnabled },
      };
    }
    try {
      await unregisterTelegramWebhook(env);
    } catch {
      /* ignore */
    }
    const settings = await saveTelegramInboundSettings(args.admin, args.workspaceId, {
      ...current,
      enabled: false,
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'set_telegram_runtime',
      action: 'execute',
      result: { enabled: false },
    });
    return {
      tool: 'set_telegram_runtime',
      ok: true,
      summary: 'Telegram è fermo.',
      data: { enabled: settings.enabled },
    };
  }

  if (action === 'update_telegram_keywords') {
    const parsed = parseTelegramKeywordCommand(args.question ?? '');
    if (!parsed) {
      return {
        tool: 'update_telegram_keywords',
        ok: false,
        summary:
          'Dimmi quale parola aggiungere e a quale gruppo. Esempio: «Aggiungi “restyling sito” alle parole chiave siti web».',
        data: {},
      };
    }
    const current = await getTelegramInboundSettings(args.admin, args.workspaceId);
    const groupKeywords = [...current.keywords[parsed.group]];
    if (!groupKeywords.some((k) => k.toLowerCase() === parsed.keyword.toLowerCase())) {
      groupKeywords.push(parsed.keyword);
    }
    const settings = await saveTelegramInboundSettings(args.admin, args.workspaceId, {
      ...current,
      keywords: { ...current.keywords, [parsed.group]: groupKeywords },
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'update_telegram_keywords',
      action: 'execute',
      result: { group: parsed.group, keyword: parsed.keyword },
    });
    return {
      tool: 'update_telegram_keywords',
      ok: true,
      summary: `Ho aggiunto «${parsed.keyword}» alle parole chiave ${parsed.groupLabel}.`,
      data: {
        group: parsed.group,
        keyword: parsed.keyword,
        keywords: settings.keywords[parsed.group],
        href: '/telegram',
      },
    };
  }

  if (action === 'list_manual_followups') {
    const due = await listDueManualFollowups(args.admin, args.workspaceId);
    if (!due.length) {
      return {
        tool: 'list_manual_followups',
        ok: true,
        summary: 'Non ci sono follow-up da approvare in questo momento.',
        data: { items: [], href: '/review-queue' },
      };
    }
    const lines = due
      .slice(0, 8)
      .map(
        (item, index) =>
          `${index + 1}. ${item.leadName} · step ${item.sequenceStep} · campagna ${item.campaignName}`,
      )
      .join('\n');
    return {
      tool: 'list_manual_followups',
      ok: true,
      summary: `Follow-up da approvare (${due.length}):\n${lines}\nApri la coda di controllo per leggere, modificare e approvare.`,
      data: { items: due, href: '/review-queue', count: due.length },
    };
  }

  if (action === 'archive_all_threads') {
    const result = await archiveOpenThreadsWork(args.admin, args.workspaceId);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'archive_all_threads',
      action: 'execute',
      entityType: 'thread',
      entityId: args.workspaceId,
      result: { archived: result.archived },
    });
    const summary =
      result.archived === 0
        ? 'Non c’è nessuna conversazione aperta da archiviare.'
        : result.archived === 1
          ? 'Ho archiviato 1 conversazione. La trovi in Archivio.'
          : `Ho archiviato ${result.archived} conversazioni. Le trovi in Archivio.`;
    return {
      tool: 'archive_all_threads',
      ok: true,
      summary,
      data: { archived: result.archived, href: '/archive' },
    };
  }

  if (
    action === 'close_won' ||
    action === 'archive_thread' ||
    action === 'drop_thread' ||
    action === 'dismiss_todo'
  ) {
    const target = await resolveCloseOutTarget(
      args.admin,
      args.workspaceId,
      refs,
      args.question ?? '',
    );
    if ('needsContext' in target) {
      return { tool: OPS_TOOL_BY_ACTION[action], ok: false, summary: target.summary, data: {} };
    }
    const kind: CloseOutKind =
      action === 'close_won' ? 'won' : action === 'drop_thread' ? 'drop' : action === 'dismiss_todo' ? 'dismiss' : 'archive';
    const result = await closeOutLeadWork(args.admin, args.workspaceId, {
      leadId: target.leadId,
      threadId: target.threadId,
      kind,
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: OPS_TOOL_BY_ACTION[action],
      action: 'execute',
      entityType: result.threadId ? 'thread' : 'lead',
      entityId: result.threadId ?? result.leadId,
      result: { kind: result.kind },
    });
    return {
      tool: OPS_TOOL_BY_ACTION[action],
      ok: true,
      summary: closeOutSummary(result),
      data: {
        leadId: result.leadId,
        threadId: result.threadId,
        href: result.threadId ? `/inbox?thread=${result.threadId}` : '/inbox',
      },
    };
  }

  if (action === 'create_slot') {
    const window = parseEuropeRomeDateTime(args.question ?? '');
    if (!window) {
      return {
        tool: 'create_calendar_slot',
        ok: false,
        summary: 'Dimmi data e ora dello slot, es. “aggiungi disponibilità domani alle 15:00”.',
        data: {},
      };
    }
    const slot = await createAvailabilitySlot(args.admin, {
      workspace_id: args.workspaceId,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      timezone: 'Europe/Rome',
      note: 'Creato da Attila chat',
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'create_calendar_slot',
      action: 'execute',
      entityType: 'slot',
      entityId: slot.id,
      result: { startsAt: slot.starts_at },
    });
    return {
      tool: 'create_calendar_slot',
      ok: true,
      summary: `Disponibilità aggiunta: ${window.label} (${formatEuropeRome(slot.starts_at)}).`,
      data: { slotId: slot.id, startsAt: slot.starts_at, label: window.label },
    };
  }

  if (action === 'reply_telegram') {
    const threadId = typeof params.threadId === 'string' ? params.threadId : null;
    if (threadId) {
      const result = await resumeTelegramAiAndReply({
        admin: args.admin,
        workspaceId: args.workspaceId,
        threadId,
        env,
        allowWhenDisabled: true,
      });
      await recordAiAudit(args.admin, {
        workspaceId: args.workspaceId,
        actor: 'AI',
        tool: 'reply_telegram',
        action: 'execute',
        entityType: 'thread',
        entityId: threadId,
        result: { sent: result.sent, reason: result.reason },
      });
      const reasonLabel =
        result.reason === 'TELEGRAM_DISABLED'
          ? 'Telegram non è attivo. Scrivi «avvia telegram», conferma, poi riprova.'
          : result.reason;
      return {
        tool: 'reply_telegram',
        ok: result.sent,
        summary: result.sent
          ? 'Ho fatto rispondere Attila sulla conversazione Telegram.'
          : `Non ho inviato: ${reasonLabel}.`,
        data: { threadId, reason: result.reason },
      };
    }
    const latest = await replyLatestPendingTelegram({
      admin: args.admin,
      workspaceId: args.workspaceId,
      env,
      allowWhenDisabled: true,
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'reply_telegram',
      action: 'execute',
      result: latest.data,
    });
    return latest;
  }

  const targetOrNeed = await resolveThreadTarget(args.admin, args.workspaceId, {
    lastThreadId:
      (typeof params.threadId === 'string' ? params.threadId : null) ?? refs.lastThreadId,
    lastLeadId: (typeof params.leadId === 'string' ? params.leadId : null) ?? refs.lastLeadId,
    lastEventId: refs.lastEventId,
  });
  if (targetOrNeed && 'needsContext' in targetOrNeed) {
    return {
      tool: String(action),
      ok: false,
      summary: targetOrNeed.summary,
      data: {},
    };
  }
  const target = targetOrNeed;
  if (!target) {
    return {
      tool: String(action),
      ok: false,
      summary: 'Non trovo una conversazione su cui agire. Apri prima un contatto in Messaggi.',
      data: {},
    };
  }

  if (action === 'take_over') {
    await args.admin
      .from('message_threads')
      .update({
        assigned_mode: 'HUMAN',
        human_required_reason: 'Takeover umano attivo',
        status: 'NEEDS_REPLY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.threadId);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'take_over_thread',
      action: 'execute',
      entityType: 'thread',
      entityId: target.threadId,
    });
    return {
      tool: 'take_over_thread',
      ok: true,
      summary: 'Conversazione in gestione manuale. Ora rispondi tu.',
      data: { threadId: target.threadId, href: `/inbox?thread=${target.threadId}` },
    };
  }

  if (action === 'return_to_ai') {
    if (target.channel === 'TELEGRAM') {
      const result = await resumeTelegramAiAndReply({
        admin: args.admin,
        workspaceId: args.workspaceId,
        threadId: target.threadId,
        env,
      });
      await recordAiAudit(args.admin, {
        workspaceId: args.workspaceId,
        actor: 'AI',
        tool: 'return_to_ai',
        action: 'execute',
        entityType: 'thread',
        entityId: target.threadId,
        result: { replied: result.sent },
      });
      return {
        tool: 'return_to_ai',
        ok: true,
        summary: result.sent
          ? 'Attila riattivato e ha risposto.'
          : `Attila riattivato (${result.reason}).`,
        data: { threadId: target.threadId, replied: result.sent },
      };
    }
    await args.admin
      .from('message_threads')
      .update({
        assigned_mode: 'AI',
        human_required_reason: null,
        status: 'OPEN',
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.threadId);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'return_to_ai',
      action: 'execute',
      entityType: 'thread',
      entityId: target.threadId,
    });
    return {
      tool: 'return_to_ai',
      ok: true,
      summary: 'Attila di nuovo attivo su questa conversazione.',
      data: { threadId: target.threadId },
    };
  }

  if (action === 'stop_automation') {
    await args.admin
      .from('message_threads')
      .update({
        commercial_state: 'NOT_INTERESTED',
        assigned_mode: 'HUMAN',
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.threadId);
    await stopLeadSequences(args.admin, args.workspaceId, target.leadId);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'stop_automation',
      action: 'execute',
      entityType: 'thread',
      entityId: target.threadId,
    });
    return {
      tool: 'stop_automation',
      ok: true,
      summary: 'Automazione fermata su questa conversazione.',
      data: { threadId: target.threadId, href: `/inbox?thread=${target.threadId}` },
    };
  }

  const eventId = typeof params.eventId === 'string' ? params.eventId : null;
  const appointment = eventId
    ? (
        await args.admin
          .from('calendar_events')
          .select('*')
          .eq('workspace_id', args.workspaceId)
          .eq('id', eventId)
          .maybeSingle()
      ).data
    : await getActiveAppointmentForLead(args.admin, args.workspaceId, target.leadId);

  if (!appointment) {
    return {
      tool: String(action),
      ok: false,
      summary: 'Nessun appuntamento attivo su questo contatto.',
      data: { threadId: target.threadId },
    };
  }

  if (action === 'cancel_appointment') {
    await cancelAppointment(args.admin, args.workspaceId, appointment.id);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'cancel_appointment',
      action: 'execute',
      entityType: 'event',
      entityId: appointment.id,
    });
    return {
      tool: 'cancel_appointment',
      ok: true,
      summary: 'Appuntamento annullato.',
      data: { eventId: appointment.id, threadId: target.threadId },
    };
  }

  if (action === 'reschedule_appointment') {
    const result = await rescheduleAppointment(args.admin, {
      workspaceId: args.workspaceId,
      eventId: appointment.id,
      leadId: target.leadId,
      threadId: target.threadId,
      title: appointment.title,
      source: 'HUMAN',
      excludeStartsAt: appointment.starts_at ? [appointment.starts_at] : [],
    });
    if (!result.ok) {
      return {
        tool: 'reschedule_appointment',
        ok: false,
        summary:
          'Non ci sono altri orari liberi dalle 9 alle 18. Riprova quando si libera un appuntamento.',
        data: { reason: result.reason },
      };
    }
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'reschedule_appointment',
      action: 'execute',
      entityType: 'event',
      entityId: result.eventId,
      result: { label: result.label },
    });
    return {
      tool: 'reschedule_appointment',
      ok: true,
      summary: `Appuntamento riprogrammato: ${result.label}.`,
      data: { eventId: result.eventId, label: result.label },
    };
  }

  return { tool: 'ops', ok: false, summary: 'Azione non riconosciuta.', data: {} };
}

/** @deprecated usa proposeOrExecuteOps */
export async function runOperatorOpsAction(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  action: OperatorOpsAction;
  question: string;
  refs: { lastThreadId?: string | null; lastLeadId?: string | null; lastEventId?: string | null };
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult> {
  if (args.action === 'none') {
    return { tool: 'ops', ok: false, summary: 'Nessuna azione.', data: {} };
  }
  return proposeOrExecuteOps({
    ...args,
    action: args.action,
  });
}
