import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export type CommercialAlert = {
  id: string;
  kind: string;
  title: string;
  reason: string;
  href: string;
  createdAt: string;
  leadName?: string | null;
  priority: 'high' | 'normal';
  channel: 'telegram' | 'email' | 'campaign' | 'any';
};

export type ListCommercialAlertsOptions = {
  limit?: number;
  /** Solo avvisi rilevanti per Telegram. */
  channel?: 'telegram' | 'all';
};

function stripJargon(text: string): string {
  return text
    .replace(/\b(HUMAN_ONLY|HUMAN_REQUIRED|APPROVAL_REQUIRED|DRAFT_ONLY|AUTO_ALLOWED)\b/gi, '')
    .replace(/\bAttila:\s*/gi, '')
    .replace(/\s*[—–-]\s*/g, ' — ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s—–-]+|[\s—–-]+$/g, '')
    .trim();
}

function humanizeOperatorMessage(message: string): { title: string; reason: string; priority: 'high' | 'normal' } {
  const clean = stripJargon(message);
  if (/prezzo|pricing|sconto/i.test(message)) {
    return {
      title: 'Serve te sul prezzo',
      reason: clean || 'Il cliente parla di prezzo: meglio rispondere tu.',
      priority: 'high',
    };
  }
  if (/interess|ecommerce|sito/i.test(message)) {
    return {
      title: 'Cliente interessato',
      reason: clean || 'Ha mostrato interesse: continua tu la conversazione.',
      priority: 'high',
    };
  }
  if (/call|chiamata|appuntamento/i.test(message)) {
    return {
      title: 'Chiamata in gioco',
      reason: clean || 'Sta valutando una chiamata.',
      priority: 'high',
    };
  }
  return {
    title: 'Serve il tuo intervento',
    reason: clean || 'Attila ha messo in pausa l’automatico su questa chat.',
    priority: 'high',
  };
}

function hrefForEvent(eventType: string, data: Record<string, unknown>, channel: CommercialAlert['channel']): string {
  if (eventType === 'FOLLOWUP_DRAFT_PREPARED' || eventType === 'followup_due') return '/review-queue';
  const threadId = typeof data.threadId === 'string' ? data.threadId : null;
  if (threadId) {
    return channel === 'telegram'
      ? `/inbox?channel=telegram&thread=${encodeURIComponent(threadId)}`
      : `/inbox?thread=${encodeURIComponent(threadId)}`;
  }
  if (channel === 'telegram' || eventType.startsWith('TELEGRAM')) return '/inbox?channel=telegram';
  if (channel === 'campaign') return '/campaigns';
  return '/inbox';
}

function dedupeKey(alert: CommercialAlert): string {
  return `${alert.kind}:${alert.leadName ?? ''}:${alert.href}`;
}

export async function listCommercialAlerts(
  admin: AppSupabaseClient,
  workspaceId: string,
  options: ListCommercialAlertsOptions = {},
): Promise<CommercialAlert[]> {
  const limit = options.limit ?? 5;
  const channelFilter = options.channel ?? 'all';
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const alerts: CommercialAlert[] = [];

  // 1) Thread che richiedono davvero l'operatore (fonte primaria, non il log rumoroso)
  let threadQuery = admin
    .from('message_threads')
    .select('id, lead_id, channel, human_required_reason, priority, commercial_state, updated_at')
    .eq('workspace_id', workspaceId)
    .or('assigned_mode.eq.HUMAN,status.eq.NEEDS_REPLY,priority.eq.HOT')
    .order('updated_at', { ascending: false })
    .limit(12);
  if (channelFilter === 'telegram') {
    threadQuery = threadQuery.eq('channel', 'TELEGRAM');
  }
  const { data: threads } = await threadQuery;
  const threadLeadIds = [...new Set((threads ?? []).map((t) => t.lead_id).filter(Boolean))];
  const { data: threadLeads } = threadLeadIds.length
    ? await admin.from('leads').select('id, name').in('id', threadLeadIds)
    : { data: [] as { id: string; name: string }[] };
  const threadLeadById = new Map((threadLeads ?? []).map((l) => [l.id, l.name]));

  for (const thread of threads ?? []) {
    const reasonRaw = thread.human_required_reason ?? thread.commercial_state ?? '';
    const copy = humanizeOperatorMessage(String(reasonRaw));
    const channel: CommercialAlert['channel'] =
      thread.channel === 'TELEGRAM' ? 'telegram' : 'email';
    alerts.push({
      id: `thread:${thread.id}`,
      kind: 'needs_you',
      title: copy.title,
      reason: copy.reason,
      href:
        channel === 'telegram'
          ? `/telegram?thread=${encodeURIComponent(thread.id)}`
          : `/inbox?thread=${encodeURIComponent(thread.id)}`,
      createdAt: thread.updated_at,
      leadName: threadLeadById.get(thread.lead_id) ?? null,
      priority: thread.priority === 'HOT' ? 'high' : copy.priority,
      channel,
    });
  }

  // 2) Appuntamenti accettati di recente
  const { data: booked } = await admin
    .from('sales_thread_events')
    .select('id, payload, created_at, thread_id')
    .eq('workspace_id', workspaceId)
    .eq('event_type', 'APPOINTMENT_BOOKED')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);

  if (booked?.length) {
    const threadIds = booked.map((b) => b.thread_id).filter(Boolean);
    const { data: bookedThreads } = threadIds.length
      ? await admin
          .from('message_threads')
          .select('id, lead_id, channel')
          .in('id', threadIds)
      : { data: [] as { id: string; lead_id: string; channel: string }[] };
    const bookedByThread = new Map((bookedThreads ?? []).map((t) => [t.id, t]));
    const bookedLeadIds = [...new Set((bookedThreads ?? []).map((t) => t.lead_id))];
    const { data: bookedLeads } = bookedLeadIds.length
      ? await admin.from('leads').select('id, name').in('id', bookedLeadIds)
      : { data: [] as { id: string; name: string }[] };
    const bookedLeadById = new Map((bookedLeads ?? []).map((l) => [l.id, l.name]));

    for (const row of booked) {
      const thread = bookedByThread.get(row.thread_id);
      if (channelFilter === 'telegram' && thread?.channel !== 'TELEGRAM') continue;
      const channel: CommercialAlert['channel'] =
        thread?.channel === 'TELEGRAM' ? 'telegram' : 'any';
      alerts.push({
        id: `booked:${row.id}`,
        kind: 'appointment_accepted',
        title: 'Appuntamento fissato',
        reason: 'Il cliente ha accettato la chiamata.',
        href: hrefForEvent('APPOINTMENT_BOOKED', { threadId: row.thread_id }, channel),
        createdAt: row.created_at,
        leadName: thread ? bookedLeadById.get(thread.lead_id) ?? null : null,
        priority: 'high',
        channel,
      });
    }
  }

  // 3) Follow-up da preparare (solo overview / all, non sulla pagina Telegram)
  if (channelFilter !== 'telegram') {
    const nowIso = new Date().toISOString();
    const { data: dueFollowups } = await admin
      .from('campaign_leads')
      .select('id, campaign_id, lead_id, sequence_step, next_action_at, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'SENT')
      .gte('sequence_step', 1)
      .lte('next_action_at', nowIso)
      .order('next_action_at', { ascending: true })
      .limit(4);

    if (dueFollowups?.length) {
      const fLeadIds = [...new Set(dueFollowups.map((r) => r.lead_id))];
      const { data: fLeads } = await admin.from('leads').select('id, name').in('id', fLeadIds);
      const fLeadById = new Map((fLeads ?? []).map((l) => [l.id, l.name]));
      for (const row of dueFollowups) {
        alerts.push({
          id: `followup:${row.id}`,
          kind: 'followup_due',
          title: 'Follow-up da preparare',
          reason: `Sollecito ${row.sequence_step} pronto: prepara la bozza e approvala.`,
          href: `/campaigns/${row.campaign_id}`,
          createdAt: row.next_action_at ?? row.updated_at,
          leadName: fLeadById.get(row.lead_id) ?? null,
          priority: 'normal',
          channel: 'campaign',
        });
      }
    }

    const { data: reviewFollowups } = await admin
      .from('campaign_leads')
      .select('id, campaign_id, lead_id, sequence_step, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'REVIEW')
      .gte('sequence_step', 1)
      .order('updated_at', { ascending: false })
      .limit(4);
    if (reviewFollowups?.length) {
      const rLeadIds = [...new Set(reviewFollowups.map((r) => r.lead_id))];
      const { data: rLeads } = await admin.from('leads').select('id, name').in('id', rLeadIds);
      const rLeadById = new Map((rLeads ?? []).map((l) => [l.id, l.name]));
      for (const row of reviewFollowups) {
        alerts.push({
          id: `review-fu:${row.id}`,
          kind: 'followup_review',
          title: 'Follow-up da approvare',
          reason: 'Bozza pronta nella coda di controllo.',
          href: '/review-queue',
          createdAt: row.updated_at,
          leadName: rLeadById.get(row.lead_id) ?? null,
          priority: 'normal',
          channel: 'campaign',
        });
      }
    }
  }

  // 4) Risposte Telegram inviate di recente (solo segnale positivo, max 1-2)
  if (channelFilter === 'telegram' || channelFilter === 'all') {
    const { data: sent } = await admin
      .from('activity_log')
      .select('id, message, data, occurred_at, lead_id')
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'TELEGRAM_REPLY_SENT')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(2);
    const sentLeadIds = [...new Set((sent ?? []).map((s) => s.lead_id).filter(Boolean))] as string[];
    const { data: sentLeads } = sentLeadIds.length
      ? await admin.from('leads').select('id, name').in('id', sentLeadIds)
      : { data: [] as { id: string; name: string }[] };
    const sentLeadById = new Map((sentLeads ?? []).map((l) => [l.id, l.name]));
    for (const row of sent ?? []) {
      const data =
        row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {};
      alerts.push({
        id: `sent:${row.id}`,
        kind: 'telegram_sent',
        title: 'Risposta inviata',
        reason: 'Attila ha risposto in automatico protetto.',
        href: hrefForEvent('TELEGRAM_REPLY_SENT', data, 'telegram'),
        createdAt: row.occurred_at,
        leadName: row.lead_id ? sentLeadById.get(row.lead_id) ?? null : null,
        priority: 'normal',
        channel: 'telegram',
      });
    }
  }

  const seen = new Set<string>();
  const deduped: CommercialAlert[] = [];
  for (const alert of alerts.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  })) {
    const key = dedupeKey(alert);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alert);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
