import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export type InboxConversationMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  sentAt: string;
  providerMessageId: string | null;
  deliveryLabel: string;
  contextLabel: string | null;
};

export type InboxConversationDetail = {
  threadId: string;
  leadId: string;
  leadName: string;
  businessStatus: string;
  subject: string | null;
  contact: {
    displayName: string;
    username: string | null;
    handle: string | null;
    telegramUrl: string | null;
  };
  chat: {
    id: string | null;
    type: string | null;
    title: string | null;
    username: string | null;
    isGroup: boolean;
    telegramUrl: string | null;
  };
  intent: string | null;
  matchedKeywords: string[];
  replyStatus: {
    state: 'SENT' | 'FAILED' | 'SKIPPED' | 'NOT_SENT';
    label: string;
    detail: string | null;
    occurredAt: string | null;
  };
  messages: InboxConversationMessage[];
  events: Array<{
    id: string;
    type: string;
    label: string;
    detail: string | null;
    occurredAt: string;
  }>;
  commercialState: string | null;
  assignedMode: string | null;
  humanRequiredReason: string | null;
  nextStep: string | null;
  sentiment: string | null;
  channel: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function getInboxConversation(
  admin: AppSupabaseClient,
  workspaceId: string,
  threadId: string,
): Promise<InboxConversationDetail | null> {
  const { data: thread, error: threadError } = await admin
    .from('message_threads')
    .select('id, lead_id, subject, status, unread_count, last_message_at, channel, commercial_state, assigned_mode, human_required_reason, next_step, sentiment')
    .eq('workspace_id', workspaceId)
    .eq('id', threadId)
    .maybeSingle();
  if (threadError) throw new Error(`Conversazione: ${threadError.message}`);
  if (!thread) return null;

  const [{ data: lead }, { data: source }, { data: contacts }, { data: messages }, { data: activity }] =
    await Promise.all([
      admin
        .from('leads')
        .select('id, name, business_status')
        .eq('workspace_id', workspaceId)
        .eq('id', thread.lead_id)
        .single(),
      admin
        .from('lead_sources')
        .select('query_snapshot')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', thread.lead_id)
        .eq('source_type', 'TELEGRAM_INBOUND')
        .maybeSingle(),
      admin
        .from('lead_contacts')
        .select('value, normalized_value, label, is_primary')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', thread.lead_id)
        .order('is_primary', { ascending: false }),
      admin
        .from('messages')
        .select(
          'id, direction, body_snapshot, sent_at, created_at, provider_message_id, subject',
        )
        .eq('workspace_id', workspaceId)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
      admin
        .from('activity_log')
        .select('id, event_type, message, data, occurred_at')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', thread.lead_id)
        .in('event_type', [
          'INBOUND_MESSAGE_RECEIVED',
          'TELEGRAM_REPLY_SENT',
          'TELEGRAM_REPLY_FAILED',
          'TELEGRAM_REPLY_SKIPPED',
        ])
        .order('occurred_at', { ascending: false })
        .limit(100),
    ]);

  const snapshot = asRecord(source?.query_snapshot);
  const primaryContact = contacts?.find((contact) => contact.is_primary) ?? contacts?.[0];
  const authorUsername = asString(snapshot.author_username);
  const chatUsername = asString(snapshot.chat_username);
  const chatTitle = asString(snapshot.chat_title);
  const chatId = asString(snapshot.chat_id);
  const isGroup = snapshot.is_group === true;
  const latestReplyEvent = activity?.find((event) =>
    event.event_type.startsWith('TELEGRAM_REPLY_'),
  );
  const latestOutbound = [...(messages ?? [])]
    .reverse()
    .find((message) => message.direction === 'OUTBOUND');

  let replyStatus: InboxConversationDetail['replyStatus'] = {
    state: 'NOT_SENT',
    label: 'Nessuna risposta inviata',
    detail: null,
    occurredAt: null,
  };
  if (latestOutbound) {
    replyStatus = {
      state: 'SENT',
      label: 'Risposta inviata',
      detail: null,
      occurredAt: latestOutbound.sent_at ?? latestOutbound.created_at,
    };
  } else if (latestReplyEvent?.event_type === 'TELEGRAM_REPLY_FAILED') {
    const data = asRecord(latestReplyEvent.data);
    replyStatus = {
      state: 'FAILED',
      label: 'Invio fallito',
      detail: asString(data.detail) ?? latestReplyEvent.message,
      occurredAt: latestReplyEvent.occurred_at,
    };
  } else if (latestReplyEvent?.event_type === 'TELEGRAM_REPLY_SKIPPED') {
    const data = asRecord(latestReplyEvent.data);
    replyStatus = {
      state: 'SKIPPED',
      label: 'Risposta non inviata',
      detail: latestReplyEvent.message ?? asString(data.reason),
      occurredAt: latestReplyEvent.occurred_at,
    };
  }

  return {
    threadId,
    leadId: thread.lead_id,
    leadName: lead?.name ?? 'Contatto Telegram',
    businessStatus: lead?.business_status ?? 'NEW',
    subject: thread.subject,
    contact: {
      displayName: asString(snapshot.author_display_name) ?? lead?.name ?? 'Contatto',
      username: authorUsername,
      handle: primaryContact?.value ?? (authorUsername ? `@${authorUsername}` : null),
      telegramUrl: authorUsername ? `https://t.me/${authorUsername}` : null,
    },
    chat: {
      id: chatId,
      type: asString(snapshot.chat_type),
      title: chatTitle,
      username: chatUsername,
      isGroup,
      telegramUrl: chatUsername ? `https://t.me/${chatUsername}` : null,
    },
    intent: asString(snapshot.intent),
    matchedKeywords: asStringArray(snapshot.keywords),
    replyStatus,
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.body_snapshot,
      sentAt: message.sent_at ?? message.created_at,
      providerMessageId: message.provider_message_id,
      deliveryLabel:
        message.direction === 'OUTBOUND' ? 'Inviato da Telegram' : 'Ricevuto',
      contextLabel: message.subject,
    })),
    events: (activity ?? []).map((event) => {
      const data = asRecord(event.data);
      return {
        id: event.id,
        type: event.event_type,
        label: event.message ?? event.event_type,
        detail: asString(data.detail) ?? asString(data.reason),
        occurredAt: event.occurred_at,
      };
    }),
    commercialState: thread.commercial_state ?? null,
    assignedMode: thread.assigned_mode ?? null,
    humanRequiredReason: thread.human_required_reason ?? null,
    nextStep: thread.next_step ?? null,
    sentiment: thread.sentiment ?? null,
    channel: thread.channel ?? null,
  };
}
