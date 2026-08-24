import type { AppSupabaseClient } from '@/lib/types/supabase-database';

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
};

/**
 * Conversazioni da gestire: priorità ai thread inbound social (senza campagna)
 * e alle email con NEEDS_REPLY.
 */
export async function listInboxThreads(
  admin: AppSupabaseClient,
  workspaceId: string,
  limit = 50,
): Promise<InboxThreadItem[]> {
  const { data: threads, error } = await admin
    .from('message_threads')
    .select(
      'id, lead_id, subject, status, unread_count, last_message_at, campaign_id, leads(id, name, business_status)',
    )
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Inbox: ${error.message}`);
  if (!threads?.length) return [];

  const threadIds = threads.map((t) => t.id);
  const leadIds = [...new Set(threads.map((t) => t.lead_id))];

  const [{ data: messages }, { data: sources }, { data: contacts }] = await Promise.all([
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
  ]);

  const latestByThread = new Map<
    string,
    { provider: string; body: string; direction: string }
  >();
  for (const m of messages ?? []) {
    if (!latestByThread.has(m.thread_id)) {
      latestByThread.set(m.thread_id, {
        provider: m.provider,
        body: m.body_snapshot,
        direction: m.direction,
      });
    }
  }

  const sourceByLead = new Map((sources ?? []).map((s) => [s.lead_id, s.source_type]));
  const contactByLead = new Map((contacts ?? []).map((c) => [c.lead_id, c.value]));

  return threads.map((t) => {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads;
    const latest = latestByThread.get(t.id);
    const sourceType = sourceByLead.get(t.lead_id);
    const isTelegram =
      sourceType === 'TELEGRAM_INBOUND' ||
      latest?.provider === 'telegram' ||
      (t.campaign_id == null && (t.subject ?? '').startsWith('Telegram'));

    const channel: InboxThreadItem['channel'] = isTelegram
      ? 'telegram'
      : latest?.provider === 'resend' || latest?.provider === 'email'
        ? 'email'
        : t.campaign_id
          ? 'email'
          : 'unknown';

    const channelLabel =
      channel === 'telegram'
        ? 'Telegram'
        : channel === 'email'
          ? 'Email'
          : 'Canale';

    return {
      threadId: t.id,
      leadId: t.lead_id,
      leadName: lead?.name ?? 'Contatto',
      subject: t.subject,
      status: t.status,
      unreadCount: t.unread_count ?? 0,
      lastMessageAt: t.last_message_at,
      channel,
      channelLabel,
      contactHandle: contactByLead.get(t.lead_id) ?? null,
      preview: latest?.body?.slice(0, 160) ?? null,
      businessStatus: lead?.business_status ?? 'NEW',
      needsAttention: t.status === 'NEEDS_REPLY' || (t.unread_count ?? 0) > 0,
    };
  });
}
