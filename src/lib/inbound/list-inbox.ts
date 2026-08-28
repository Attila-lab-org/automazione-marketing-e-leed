import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { emailHtmlToText } from '@/lib/messaging/html-to-text';

export type InboxThreadItem = {
  threadId: string;
  leadId: string;
  leadName: string;
  subject: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  channel: 'telegram' | 'email' | 'unknown';
  channelLabel: string;
  contactHandle: string | null;
  preview: string | null;
  businessStatus: string;
  needsAttention: boolean;
  commercialState: string | null;
  assignedMode: 'AI' | 'HUMAN' | null;
  priority: string | null;
  sentiment: string | null;
  nextStep: string | null;
  nextStepAt: string | null;
  humanRequiredReason: string | null;
  campaignId: string | null;
  campaignName: string | null;
  latestDirection: 'INBOUND' | 'OUTBOUND' | null;
  hasInboundReply: boolean;
};

export type ListInboxOptions = {
  /** Filtra per canale. Default: all. */
  channel?: 'telegram' | 'email' | 'all';
  /** Se false (default) esclude le conversazioni ARCHIVED. */
  includeArchived?: boolean;
  limit?: number;
};

/**
 * Conversazioni da gestire.
 * Per Telegram passa channel:'telegram' e includeArchived solo nella vista archivio.
 */
export async function listInboxThreads(
  admin: AppSupabaseClient,
  workspaceId: string,
  options: ListInboxOptions | number = {},
): Promise<InboxThreadItem[]> {
  const opts: ListInboxOptions =
    typeof options === 'number' ? { limit: options } : options;
  const limit = opts.limit ?? 200;
  const channelFilter = opts.channel ?? 'all';
  const includeArchived = opts.includeArchived === true;

  let query = admin
    .from('message_threads')
    .select(
      'id, lead_id, subject, status, unread_count, last_message_at, campaign_id, channel, commercial_state, assigned_mode, priority, sentiment, next_step, next_step_at, human_required_reason, leads!message_threads_lead_id_fkey(id, name, business_status)',
    )
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(400, Math.max(limit * 2, limit)));

  if (!includeArchived) {
    query = query.neq('status', 'ARCHIVED');
  }
  if (channelFilter === 'telegram') {
    query = query.eq('channel', 'TELEGRAM');
  } else if (channelFilter === 'email') {
    query = query.eq('channel', 'EMAIL');
  }

  const { data: threads, error } = await query;
  if (error) throw new Error(`Inbox: ${error.message}`);
  if (!threads?.length) return [];

  const threadIds = threads.map((t) => t.id);
  const leadIds = [...new Set(threads.map((t) => t.lead_id))];

  const campaignIds = [...new Set(threads.map((t) => t.campaign_id).filter(Boolean))] as string[];
  const [{ data: messages }, { data: sources }, { data: contacts }, { data: campaigns }] = await Promise.all([
    admin
      .from('messages')
      .select('thread_id, provider, body_snapshot, direction, sent_at, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
    admin
      .from('lead_sources')
      .select('lead_id, source_type')
      .eq('workspace_id', workspaceId)
      .in('lead_id', leadIds)
      .in('source_type', [
        'TELEGRAM_INBOUND',
        'DISCORD_INBOUND',
        'MASTODON_INBOUND',
        'BLUESKY_INBOUND',
      ]),
    admin
      .from('lead_contacts')
      .select('lead_id, value, source')
      .eq('workspace_id', workspaceId)
      .in('lead_id', leadIds)
      .eq('is_primary', true),
    campaignIds.length
      ? admin
          .from('campaigns')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('id', campaignIds)
      : Promise.resolve({ data: [] }),
  ]);

  const latestByThread = new Map<
    string,
    {
      provider: string;
      body: string;
      direction: 'INBOUND' | 'OUTBOUND';
      at: string | null;
    }
  >();
  const inboundThreadIds = new Set<string>();
  for (const m of messages ?? []) {
    if (m.direction === 'INBOUND') inboundThreadIds.add(m.thread_id);
    if (!latestByThread.has(m.thread_id)) {
      latestByThread.set(m.thread_id, {
        provider: m.provider,
        body: m.body_snapshot,
        direction: m.direction,
        at: m.sent_at ?? m.created_at,
      });
    }
  }

  const sourceByLead = new Map((sources ?? []).map((s) => [s.lead_id, s.source_type]));
  const contactByLead = new Map((contacts ?? []).map((c) => [c.lead_id, c.value]));
  const campaignById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign.name]));

  const mapped = threads.map((t) => {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads;
    const latest = latestByThread.get(t.id);
    const sourceType = sourceByLead.get(t.lead_id);
    const channelFromDb =
      t.channel === 'TELEGRAM' ? 'telegram' : t.channel === 'EMAIL' ? 'email' : null;
    const isTelegram =
      channelFromDb === 'telegram' ||
      sourceType === 'TELEGRAM_INBOUND' ||
      latest?.provider === 'telegram' ||
      (t.campaign_id == null && (t.subject ?? '').startsWith('Telegram'));

    const channel: InboxThreadItem['channel'] = channelFromDb
      ? channelFromDb
      : isTelegram
        ? 'telegram'
        : latest?.provider === 'resend' || latest?.provider === 'email'
          ? 'email'
          : t.campaign_id
            ? 'email'
            : 'unknown';

    const channelLabel =
      channel === 'telegram' ? 'Telegram' : channel === 'email' ? 'Email' : 'Canale';

    return {
      threadId: t.id,
      leadId: t.lead_id,
      leadName: lead?.name ?? 'Contatto',
      subject: t.subject,
      status: t.status,
      unreadCount: t.unread_count ?? 0,
      lastMessageAt: latest?.at ?? t.last_message_at,
      channel,
      channelLabel,
      contactHandle: contactByLead.get(t.lead_id) ?? null,
      preview: latest?.body ? emailHtmlToText(latest.body).slice(0, 160) : null,
      businessStatus: lead?.business_status ?? 'NEW',
      needsAttention:
        t.status === 'NEEDS_REPLY' ||
        (t.unread_count ?? 0) > 0 ||
        t.commercial_state === 'HUMAN_REQUIRED',
      commercialState: t.commercial_state ?? null,
      assignedMode: t.assigned_mode === 'HUMAN' || t.assigned_mode === 'AI' ? t.assigned_mode : null,
      priority: t.priority ?? null,
      sentiment: t.sentiment ?? null,
      nextStep: t.next_step ?? null,
      nextStepAt: t.next_step_at ?? null,
      humanRequiredReason: t.human_required_reason ?? null,
      campaignId: t.campaign_id ?? null,
      campaignName: t.campaign_id ? campaignById.get(t.campaign_id) ?? null : null,
      latestDirection:
        latest?.direction === 'INBOUND' || latest?.direction === 'OUTBOUND'
          ? latest.direction
          : null,
      hasInboundReply: inboundThreadIds.has(t.id),
    };
  });

  const filtered =
    channelFilter === 'telegram'
      ? mapped.filter((t) => t.channel === 'telegram')
      : channelFilter === 'email'
        ? mapped.filter((t) => t.channel === 'email')
        : mapped;

  const withArchiveFilter = includeArchived
    ? filtered.filter((t) => t.status === 'ARCHIVED')
    : filtered.filter((t) => t.status !== 'ARCHIVED');

  return withArchiveFilter
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
    )
    .slice(0, limit);
}
