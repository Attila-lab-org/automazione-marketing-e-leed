import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { ensureInboundThread } from '@/lib/messaging/persist';
import { processSalesInbound } from '@/lib/sales/pipeline';
import {
  scheduleFollowUpLater,
  stopLeadFollowups,
  stopLeadSequences,
  suppressLeadEmail,
} from '@/lib/sales/stop';
import {
  findEmailConversationThread,
  sendEmailConversationReply,
} from '@/lib/inbound/email-reply';
import { getEmailReplyPathReadiness } from '@/lib/inbound/email-readiness';

export type NormalizedEmailInbound = {
  kind: 'delivery' | 'reply';
  providerEventId: string;
  type: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  text: string | null;
  providerMessageId: string | null;
  messageHeaderId: string | null;
};

const DELIVERY_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.delivery_delayed',
]);

export function getEmailInboundReadiness(env: NodeJS.ProcessEnv = process.env): {
  endpoint: 'READY';
  verification: 'READY' | 'MISSING';
  receiving: 'READY' | 'MISSING';
  missing: string[];
} {
  const missing: string[] = [];
  const verification = env.RESEND_WEBHOOK_SECRET?.trim() ? 'READY' : 'MISSING';
  if (verification === 'MISSING') missing.push('RESEND_WEBHOOK_SECRET');
  const replyPath = getEmailReplyPathReadiness(env);
  const receiving = replyPath.ready ? 'READY' : 'MISSING';
  if (receiving === 'MISSING') {
    missing.push(...replyPath.missing);
  }
  return { endpoint: 'READY', verification, receiving, missing };
}

export function normalizeResendInboundPayload(payload: Record<string, unknown>): NormalizedEmailInbound | null {
  const type = typeof payload.type === 'string' ? payload.type : '';
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};
  if (DELIVERY_TYPES.has(type) || type.endsWith('.delivered') || type.endsWith('.bounced')) {
    return {
      kind: 'delivery',
      providerEventId: String(payload.created_at ?? type),
      type,
      from: null,
      to: Array.isArray(data.to) ? String(data.to[0] ?? '') : typeof data.to === 'string' ? data.to : null,
      subject: null,
      text: null,
      providerMessageId: typeof data.email_id === 'string' ? data.email_id : null,
      messageHeaderId: null,
    };
  }
  if (type === 'email.received' || type === 'email.replied') {
    const from =
      typeof data.from === 'string'
        ? data.from
        : data.from && typeof data.from === 'object' && 'address' in (data.from as object)
          ? String((data.from as { address?: string }).address ?? '')
          : null;
    const text =
      typeof data.text === 'string'
        ? data.text
        : typeof data.html === 'string'
          ? data.html.replace(/<[^>]+>/g, ' ')
          : null;
    if (!text || !from) return null;
    const rawHeaders =
      data.headers && typeof data.headers === 'object'
        ? (data.headers as Record<string, unknown>)
        : {};
    const messageHeaderId =
      typeof data.message_id === 'string'
        ? data.message_id
        : typeof rawHeaders['message-id'] === 'string'
          ? rawHeaders['message-id']
          : typeof rawHeaders['Message-ID'] === 'string'
            ? rawHeaders['Message-ID']
            : null;
    return {
      kind: 'reply',
      providerEventId: `${type}:${from}:${payload.created_at ?? Date.now()}`,
      type,
      from,
      to: Array.isArray(data.to) ? String(data.to[0] ?? '') : null,
      subject: typeof data.subject === 'string' ? data.subject : null,
      text,
      providerMessageId: typeof data.email_id === 'string' ? data.email_id : null,
      messageHeaderId,
    };
  }
  return null;
}

export async function persistEmailReply(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  inbound: NormalizedEmailInbound;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: boolean; reason: string }> {
  if (args.inbound.kind !== 'reply' || !args.inbound.text || !args.inbound.from) {
    return { ok: true, reason: 'NOT_A_REPLY' };
  }
  const fromMatch = args.inbound.from.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const from = (fromMatch?.[0] ?? args.inbound.from).toLowerCase();

  if (args.inbound.providerMessageId) {
    const { data: dup } = await args.admin
      .from('messages')
      .select('id')
      .eq('provider', 'resend')
      .eq('provider_message_id', `in:${args.inbound.providerMessageId}`)
      .maybeSingle();
    if (dup?.id) return { ok: true, reason: 'DUPLICATE' };
  }

  const conversation = await findEmailConversationThread(
    args.admin,
    args.workspaceId,
    from,
    args.inbound.subject,
  );
  const { data: fallbackLead } = conversation
    ? { data: null }
    : await args.admin
        .from('leads')
        .select('id')
        .eq('workspace_id', args.workspaceId)
        .eq('normalized_email', from)
        .maybeSingle();
  const leadId = conversation?.leadId ?? fallbackLead?.id;
  if (!leadId) return { ok: false, reason: 'LEAD_NOT_FOUND' };
  const threadId =
    conversation?.threadId ??
    (await ensureInboundThread(
      args.admin,
      args.workspaceId,
      leadId,
      args.inbound.subject ?? 'Email inbound',
    ));
  const receivedAt = new Date().toISOString();
  await args.admin.from('messages').insert({
    workspace_id: args.workspaceId,
    thread_id: threadId,
    lead_id: leadId,
    direction: 'INBOUND',
    provider: 'resend',
    provider_message_id: args.inbound.providerMessageId ? `in:${args.inbound.providerMessageId}` : null,
    from_address: args.inbound.from,
    to_address: args.inbound.to ?? '',
    subject: args.inbound.subject,
    body_snapshot: args.inbound.text,
    sequence_step: 0,
    sent_at: receivedAt,
  });
  const { data: threadState } = await args.admin
    .from('message_threads')
    .select('unread_count')
    .eq('id', threadId)
    .maybeSingle();
  await args.admin
    .from('message_threads')
    .update({
      last_message_at: receivedAt,
      unread_count: (threadState?.unread_count ?? 0) + 1,
      status: 'NEEDS_REPLY',
      updated_at: receivedAt,
    })
    .eq('id', threadId);

  // Una risposta reale interrompe sempre i follow-up freddi. Da qui in poi
  // prosegue la conversazione AI sul medesimo thread della campagna.
  await stopLeadFollowups(args.admin, args.workspaceId, leadId);

  const sales = await processSalesInbound({
    admin: args.admin,
    workspaceId: args.workspaceId,
    threadId,
    leadId,
    text: args.inbound.text,
    channel: 'EMAIL',
    env: args.env,
  });
  if (sales.classification.unsubscribe) {
    await suppressLeadEmail(args.admin, args.workspaceId, leadId, 'UNSUBSCRIBE');
    await stopLeadSequences(args.admin, args.workspaceId, leadId);
  } else if (sales.classification.notInterested) {
    await stopLeadSequences(args.admin, args.workspaceId, leadId);
  } else if (sales.classification.followUpLater) {
    const at = new Date();
    at.setMonth(at.getMonth() + 1);
    await scheduleFollowUpLater(args.admin, args.workspaceId, leadId, threadId, at);
  }

  if (
    sales.mode === 'AUTO_ALLOWED' &&
    !sales.humanRequired &&
    sales.draft &&
    !sales.classification.unsubscribe &&
    !sales.classification.notInterested &&
    !sales.classification.followUpLater
  ) {
    const sent = await sendEmailConversationReply({
      admin: args.admin,
      workspaceId: args.workspaceId,
      threadId,
      leadId,
      campaignLeadId: conversation?.campaignLeadId ?? null,
      recipient: from,
      subject: args.inbound.subject ?? conversation?.previousSubject ?? null,
      text: sales.draft,
      inboundProviderEventId: args.inbound.providerEventId,
      inboundMessageHeaderId: args.inbound.messageHeaderId,
      previousProviderMessageId: conversation?.previousProviderMessageId ?? null,
      env: args.env,
    });
    return { ok: sent.sent, reason: sent.reason };
  }

  return {
    ok: true,
    reason:
      sales.mode === 'HUMAN_ONLY' || sales.humanRequired
        ? 'REPLY_PERSISTED_HUMAN_REQUIRED'
        : 'REPLY_PERSISTED_NO_AUTO_SEND',
  };
}
