import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { WriteResult } from './writes';
import { recordAiAudit } from './writes';
import { createPendingAction } from './pending';
import { getToolContract, isConfirmTier } from './tool-contracts';
import { formatEuropeRome, parseEuropeRomeDateTime } from './time';
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
} from '@/lib/inbound/telegram-settings';
import {
  getTelegramCredentialStatus,
  registerTelegramWebhook,
  unregisterTelegramWebhook,
} from '@/lib/providers/telegram/webhook';
import { stopLeadSequences } from '@/lib/sales/stop';

export type OperatorOpsAction =
  | 'reply_telegram'
  | 'take_over'
  | 'return_to_ai'
  | 'stop_automation'
  | 'create_slot'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  | 'start_telegram'
  | 'stop_telegram'
  | 'none';

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectOperatorOpsAction(question: string): OperatorOpsAction {
  const q = norm(question);
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
    q.includes('gestione manuale')
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
  return 'none';
}

const OPS_TOOL_BY_ACTION: Record<Exclude<OperatorOpsAction, 'none'>, string> = {
  reply_telegram: 'reply_telegram',
  take_over: 'take_over_thread',
  return_to_ai: 'return_to_ai',
  stop_automation: 'stop_automation',
  create_slot: 'create_calendar_slot',
  cancel_appointment: 'cancel_appointment',
  reschedule_appointment: 'reschedule_appointment',
  start_telegram: 'set_telegram_runtime',
  stop_telegram: 'set_telegram_runtime',
};

export type ThreadTarget = { threadId: string; leadId: string; channel: string; ambiguous?: boolean };

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
        confirmLabel: contract.humanConfirmLabel ?? 'Conferma azione',
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
    return {
      tool: 'set_telegram_runtime',
      ok: true,
      summary:
        args.action === 'start_telegram'
          ? 'Sto per avviare Telegram (webhook + ascolto).'
          : 'Sto per fermare Telegram.',
      data: { runtimeAction: args.action === 'start_telegram' ? 'start' : 'stop' },
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

  const runtimeAction =
    action === 'start_telegram' || params.runtimeAction === 'start'
      ? 'start'
      : action === 'stop_telegram' || params.runtimeAction === 'stop'
        ? 'stop'
        : null;

  if (runtimeAction) {
    const current = await getTelegramInboundSettings(args.admin, args.workspaceId);
    const connection = getTelegramCredentialStatus(env);
    if (runtimeAction === 'start') {
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
      });
      await recordAiAudit(args.admin, {
        workspaceId: args.workspaceId,
        actor: 'AI',
        tool: 'set_telegram_runtime',
        action: 'execute',
        result: { enabled: true },
      });
      return {
        tool: 'set_telegram_runtime',
        ok: true,
        summary: 'Telegram è attivo e in ascolto.',
        data: { enabled: settings.enabled, webhookUrl },
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
      return {
        tool: 'reply_telegram',
        ok: result.sent,
        summary: result.sent
          ? 'Ho fatto rispondere Attila sulla conversazione Telegram.'
          : `Non ho inviato: ${result.reason}.`,
        data: { threadId, reason: result.reason },
      };
    }
    const latest = await replyLatestPendingTelegram({
      admin: args.admin,
      workspaceId: args.workspaceId,
      env,
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
          'Non ci sono slot alternativi. Aggiungi disponibilità in Calendario e riprova.',
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
