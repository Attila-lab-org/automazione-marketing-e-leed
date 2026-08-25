import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { ensureInboundThread } from '@/lib/messaging/persist';
import { processSalesInbound } from '@/lib/sales/pipeline';
import { scheduleFollowUpLater, stopLeadSequences, suppressLeadEmail } from '@/lib/sales/stop';

export type NormalizedEmailInbound = {
  kind: 'delivery' | 'reply';
  providerEventId: string;
  type: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  text: string | null;
  providerMessageId: string | null;
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
  const receiving =
    env.RESEND_INBOUND_DOMAIN?.trim() || env.RESEND_INBOUND_ENABLED === 'true' ? 'READY' : 'MISSING';
  if (receiving === 'MISSING') {
    missing.push('RESEND_INBOUND_DOMAIN oppure inbound receiving su Resend');
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
    return {
      kind: 'reply',
      providerEventId: `${type}:${from}:${payload.created_at ?? Date.now()}`,
      type,
      from,
      to: Array.isArray(data.to) ? String(data.to[0] ?? '') : null,
      subject: typeof data.subject === 'string' ? data.subject : null,
      text,
      providerMessageId: typeof data.email_id === 'string' ? data.email_id : null,
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
  const { data: lead } = await args.admin
    .from('leads')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('normalized_email', from)
    .maybeSingle();
  if (!lead) return { ok: false, reason: 'LEAD_NOT_FOUND' };

  if (args.inbound.providerMessageId) {
    const { data: dup } = await args.admin
      .from('messages')
      .select('id')
      .eq('provider', 'resend')
      .eq('provider_message_id', `in:${args.inbound.providerMessageId}`)
      .maybeSingle();
    if (dup?.id) return { ok: true, reason: 'DUPLICATE' };
  }

  const threadId = await ensureInboundThread(
    args.admin,
    args.workspaceId,
    lead.id,
    args.inbound.subject ?? 'Email inbound',
  );
  await args.admin.from('messages').insert({
    workspace_id: args.workspaceId,
    thread_id: threadId,
    lead_id: lead.id,
    direction: 'INBOUND',
    provider: 'resend',
    provider_message_id: args.inbound.providerMessageId ? `in:${args.inbound.providerMessageId}` : null,
    from_address: args.inbound.from,
    to_address: args.inbound.to ?? '',
    subject: args.inbound.subject,
    body_snapshot: args.inbound.text,
    sequence_step: 0,
    sent_at: new Date().toISOString(),
  });

  const sales = await processSalesInbound({
    admin: args.admin,
    workspaceId: args.workspaceId,
    threadId,
    leadId: lead.id,
    text: args.inbound.text,
    channel: 'EMAIL',
    env: args.env,
  });
  if (sales.classification.unsubscribe) {
    await suppressLeadEmail(args.admin, args.workspaceId, lead.id, 'UNSUBSCRIBE');
    await stopLeadSequences(args.admin, args.workspaceId, lead.id);
  } else if (sales.classification.notInterested) {
    await stopLeadSequences(args.admin, args.workspaceId, lead.id);
  } else if (sales.classification.followUpLater) {
    const at = new Date();
    at.setMonth(at.getMonth() + 1);
    await scheduleFollowUpLater(args.admin, args.workspaceId, lead.id, threadId, at);
  }
  return { ok: true, reason: 'REPLY_PERSISTED' };
}
