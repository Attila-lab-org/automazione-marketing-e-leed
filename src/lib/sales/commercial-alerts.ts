import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export type CommercialAlert = {
  id: string;
  kind: string;
  title: string;
  reason: string;
  href: string;
  createdAt: string;
  leadName?: string | null;
};

const EVENT_COPY: Record<string, { title: string; reason: (msg: string) => string }> = {
  INBOUND_MESSAGE_RECEIVED: {
    title: 'Nuovo contatto',
    reason: () => 'È arrivato un messaggio: Attila lo ha classificato.',
  },
  TELEGRAM_REPLY_SENT: {
    title: 'Risposta automatica inviata',
    reason: () => 'I controlli di sicurezza sono passati e Attila ha risposto.',
  },
  TELEGRAM_SEND_GUARD_BLOCKED: {
    title: 'Bozza bloccata',
    reason: (msg) => msg || 'Invio automatico bloccato: serve il tuo controllo.',
  },
  TELEGRAM_REPLY_SKIPPED: {
    title: 'Bozza bloccata',
    reason: (msg) => msg || 'Nessun invio automatico: bozza o policy da controllare.',
  },
  OPERATOR_ALERT: {
    title: 'Richiesta urgente',
    reason: (msg) => msg || 'Attila chiede la tua attenzione.',
  },
  FOLLOWUP_DRAFT_PREPARED: {
    title: 'Follow-up da approvare',
    reason: () => 'Bozza personalizzata pronta nella coda di controllo.',
  },
  APPOINTMENT_BOOKED: {
    title: 'Appuntamento accettato',
    reason: () => 'Il cliente ha accettato una chiamata.',
  },
};

function humanizeKind(kind: string, message: string): { title: string; reason: string } {
  if (kind.includes('price') || /prezzo/i.test(message)) {
    return { title: 'Richiesta prezzo', reason: message || 'Il cliente ha chiesto del prezzo.' };
  }
  if (kind.includes('interest') || /interess/i.test(message)) {
    return { title: 'Cliente interessato', reason: message || 'Segnale di interesse chiaro.' };
  }
  if (kind.includes('draft') || kind.includes('telegram_draft')) {
    return { title: 'Bozza bloccata', reason: message || 'Serve la tua conferma prima di inviare.' };
  }
  const mapped = EVENT_COPY[kind];
  if (mapped) return { title: mapped.title, reason: mapped.reason(message) };
  return {
    title: 'Aggiornamento commerciale',
    reason: message || 'Attila ha aggiornato la conversazione.',
  };
}

function hrefForEvent(eventType: string, data: Record<string, unknown>): string {
  if (eventType === 'FOLLOWUP_DRAFT_PREPARED') return '/review';
  const threadId = typeof data.threadId === 'string' ? data.threadId : null;
  if (threadId) return `/inbox?thread=${encodeURIComponent(threadId)}`;
  if (eventType.startsWith('TELEGRAM')) return '/telegram';
  return '/overview';
}

export async function listCommercialAlerts(
  admin: AppSupabaseClient,
  workspaceId: string,
  limit = 12,
): Promise<CommercialAlert[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await admin
    .from('activity_log')
    .select('id, event_type, message, data, occurred_at, lead_id')
    .eq('workspace_id', workspaceId)
    .in('event_type', [
      'INBOUND_MESSAGE_RECEIVED',
      'TELEGRAM_REPLY_SENT',
      'TELEGRAM_SEND_GUARD_BLOCKED',
      'TELEGRAM_REPLY_SKIPPED',
      'OPERATOR_ALERT',
      'FOLLOWUP_DRAFT_PREPARED',
    ])
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(40);

  const { data: salesEvents } = await admin
    .from('sales_thread_events')
    .select('id, event_type, payload, created_at, thread_id')
    .eq('workspace_id', workspaceId)
    .in('event_type', ['APPOINTMENT_BOOKED', 'INBOUND_CLASSIFIED', 'AI_REPLY_DRAFT'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40);

  const leadIds = [
    ...new Set([
      ...(logs ?? []).map((row) => row.lead_id).filter(Boolean),
      ...(((salesEvents ?? [])
        .map((row) => {
          const payload =
            row.payload && typeof row.payload === 'object'
              ? (row.payload as Record<string, unknown>)
              : {};
          return typeof payload.leadId === 'string' ? payload.leadId : null;
        })
        .filter(Boolean) as string[])),
    ]),
  ] as string[];

  const { data: leads } = leadIds.length
    ? await admin.from('leads').select('id, name').in('id', leadIds)
    : { data: [] as { id: string; name: string }[] };
  const leadById = new Map((leads ?? []).map((l) => [l.id, l.name]));

  const alerts: CommercialAlert[] = [];

  for (const row of logs ?? []) {
    const data =
      row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {};
    const kind =
      typeof data.kind === 'string' ? data.kind : row.event_type;
    // Skip noisy skips that are just "follow-up no auto"
    if (
      row.event_type === 'TELEGRAM_REPLY_SKIPPED' &&
      typeof data.reason === 'string' &&
      data.reason === 'FOLLOWUP_NO_AUTO_REPLY'
    ) {
      continue;
    }
    const copy = humanizeKind(kind, row.message ?? '');
    alerts.push({
      id: `log:${row.id}`,
      kind,
      title: copy.title,
      reason: copy.reason,
      href: hrefForEvent(row.event_type, data),
      createdAt: row.occurred_at,
      leadName: row.lead_id ? leadById.get(row.lead_id) ?? null : null,
    });
  }

  for (const row of salesEvents ?? []) {
    const payload =
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {};
    if (row.event_type === 'APPOINTMENT_BOOKED') {
      alerts.push({
        id: `sales:${row.id}`,
        kind: 'appointment_accepted',
        title: 'Appuntamento accettato',
        reason: 'Il cliente ha confermato la chiamata.',
        href: row.thread_id
          ? `/inbox?thread=${encodeURIComponent(row.thread_id)}`
          : '/calendar',
        createdAt: row.created_at,
        leadName: null,
      });
      continue;
    }
    if (row.event_type === 'INBOUND_CLASSIFIED') {
      const intent = typeof payload.intent === 'string' ? payload.intent : '';
      const pricing = payload.pricing === true;
      if (pricing || intent === 'quote_request') {
        alerts.push({
          id: `sales:${row.id}`,
          kind: 'price_request',
          title: 'Richiesta prezzo',
          reason: 'Il cliente ha chiesto informazioni sul prezzo.',
          href: row.thread_id
            ? `/inbox?thread=${encodeURIComponent(row.thread_id)}`
            : '/inbox',
          createdAt: row.created_at,
          leadName: null,
        });
      } else if (intent === 'call_accept' || payload.bookingAccepted === true) {
        alerts.push({
          id: `sales:${row.id}`,
          kind: 'client_interested',
          title: 'Cliente interessato',
          reason: 'Segnale chiaro di interesse a una chiamata.',
          href: row.thread_id
            ? `/inbox?thread=${encodeURIComponent(row.thread_id)}`
            : '/inbox',
          createdAt: row.created_at,
          leadName: null,
        });
      }
    }
  }

  // Follow-ups due (not yet prepared)
  const nowIso = new Date().toISOString();
  const { data: dueFollowups } = await admin
    .from('campaign_leads')
    .select('id, campaign_id, lead_id, sequence_step, next_action_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'SENT')
    .gte('sequence_step', 1)
    .lte('next_action_at', nowIso)
    .order('next_action_at', { ascending: true })
    .limit(8);

  if (dueFollowups?.length) {
    const fLeadIds = [...new Set(dueFollowups.map((r) => r.lead_id))];
    const { data: fLeads } = await admin.from('leads').select('id, name').in('id', fLeadIds);
    const fLeadById = new Map((fLeads ?? []).map((l) => [l.id, l.name]));
    for (const row of dueFollowups) {
      alerts.push({
        id: `followup:${row.id}`,
        kind: 'followup_due',
        title: 'Follow-up da approvare',
        reason: `Follow-up ${row.sequence_step} pronto da preparare e controllare.`,
        href: `/campaigns/${row.campaign_id}`,
        createdAt: row.next_action_at ?? row.updated_at,
        leadName: fLeadById.get(row.lead_id) ?? null,
      });
    }
  }

  return alerts
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}
