import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { BusinessStatus, PolicyEvaluation } from '@/lib/types/domain';
import type { Json } from '@/lib/types/database';
import { isValidEmailShape, normalizeEmailAddress } from '@/lib/campaigns/test-delivery';
import { emailHtmlToText } from '@/lib/messaging/html-to-text';
import { getResendProvider } from '@/lib/providers/resend';
import { runSendGuard } from '@/lib/send-guard';
import { getOutreachPausedAll } from '@/lib/settings/outreach-pause';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replyHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2c241e">${escapeHtml(paragraph).replaceAll('\n', '<br/>')}</p>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Georgia,serif"><tr><td>${paragraphs}</td></tr></table>`;
}

function replySubject(subject: string | null): string {
  const clean = (subject ?? 'La nostra conversazione').trim().replace(/^(re:\s*)+/i, '');
  return `Re: ${clean}`;
}

function conversationPolicy(now: string, approvedByHuman: boolean): PolicyEvaluation {
  return {
    action: 'send',
    gateMode: 'SCORE_THRESHOLD',
    decision: approvedByHuman ? 'REVIEW' : 'AUTO',
    autoApproved: !approvedByHuman,
    reasons: [
      approvedByHuman
        ? 'Risposta conversazionale approvata esplicitamente dall’operatore'
        : 'Risposta conversazionale AI autorizzata dalla pipeline commerciale',
    ],
    policyVersionId: null,
    policyVersion: null,
    evaluatedAt: now,
  };
}

export async function findEmailConversationThread(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<{
  threadId: string;
  campaignLeadId: string | null;
  previousSubject: string | null;
  previousProviderMessageId: string | null;
} | null> {
  const { data } = await admin
    .from('messages')
    .select('thread_id, campaign_lead_id, subject, provider_message_id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .eq('provider', 'resend')
    .eq('direction', 'OUTBOUND')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    threadId: data.thread_id,
    campaignLeadId: data.campaign_lead_id,
    previousSubject: data.subject,
    previousProviderMessageId: data.provider_message_id,
  };
}

export async function sendEmailConversationReply(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  leadId: string;
  campaignLeadId: string | null;
  recipient: string;
  subject: string | null;
  text: string;
  inboundProviderEventId: string;
  inboundMessageHeaderId?: string | null;
  previousProviderMessageId?: string | null;
  approvedByHuman?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<{ sent: boolean; reason: string; messageId?: string }> {
  const env = args.env ?? process.env;
  const recipient = normalizeEmailAddress(args.recipient);
  const now = new Date().toISOString();
  const subject = replySubject(args.subject);
  const html = replyHtml(args.text);

  const [{ data: lead }, { data: suppressed }, outreachPausedAll, { data: duplicate }] =
    await Promise.all([
      args.admin
        .from('leads')
        .select('business_status')
        .eq('workspace_id', args.workspaceId)
        .eq('id', args.leadId)
        .maybeSingle(),
      args.admin
        .from('suppression_list')
        .select('id')
        .eq('workspace_id', args.workspaceId)
        .eq('normalized_email', recipient)
        .maybeSingle(),
      getOutreachPausedAll(args.admin, args.workspaceId),
      args.admin
        .from('message_events')
        .select('id')
        .eq('workspace_id', args.workspaceId)
        .eq('provider_event_id', `conversation-source:${args.inboundProviderEventId}`)
        .maybeSingle(),
    ]);

  const guard = runSendGuard({
    sendKind: 'CONVERSATION',
    recipient: {
      email: recipient,
      emailValid: isValidEmailShape(recipient),
      suppressed: Boolean(suppressed?.id),
    },
    lead: {
      businessStatus: (lead?.business_status ?? 'REPLIED') as BusinessStatus,
      hasBlockingReply: true,
    },
    campaign: {
      status: 'ACTIVE',
      rateLimitAvailable: true,
      outreachPausedAll,
    },
    policy: {
      evaluation: conversationPolicy(now, Boolean(args.approvedByHuman)),
      humanApproved: Boolean(args.approvedByHuman),
    },
    message: {
      subject,
      body: html,
      status: 'READY',
    },
    demo: {
      required: false,
      demoReady: true,
      screenshotReady: true,
    },
    idempotency: {
      alreadySent: Boolean(duplicate?.id),
    },
  });

  await args.admin.from('activity_log').insert({
    workspace_id: args.workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'lead',
    entity_id: args.leadId,
    lead_id: args.leadId,
    category: 'DECISION',
    event_type: 'EMAIL_CONVERSATION_SEND_GUARD',
    message: guard.allowed
      ? args.approvedByHuman
        ? 'Risposta email manuale autorizzata da Send Guard'
        : 'Risposta email AI autorizzata da Send Guard'
      : 'Risposta email bloccata da Send Guard',
    data: {
      threadId: args.threadId,
      allowed: guard.allowed,
      blockers: guard.blockers,
      checks: guard.checks,
    } as unknown as Json,
  });

  if (!guard.allowed) {
    return { sent: false, reason: guard.blockers.join('; ') || 'SEND_GUARD_BLOCKED' };
  }

  const from = env.RESEND_FROM?.trim();
  if (!from) return { sent: false, reason: 'RESEND_FROM_MISSING' };

  const reference =
    args.inboundMessageHeaderId?.trim() || args.previousProviderMessageId?.trim() || null;
  const headers: Record<string, string> = {};
  headers['Reply-To'] = env.RESEND_REPLY_TO?.trim() || from;
  if (reference) {
    headers['In-Reply-To'] = reference;
    headers.References = reference;
  }

  const idempotencyKey = `EMAIL_REPLY:${args.threadId}:${args.inboundProviderEventId}`;
  const sent = await getResendProvider(env).send({
    from,
    to: recipient,
    subject,
    html,
    text: emailHtmlToText(html),
    idempotencyKey,
    headers,
  });

  const { data: message, error } = await args.admin
    .from('messages')
    .insert({
      workspace_id: args.workspaceId,
      thread_id: args.threadId,
      lead_id: args.leadId,
      campaign_lead_id: args.campaignLeadId,
      direction: 'OUTBOUND',
      provider: 'resend',
      provider_message_id: sent.providerMessageId,
      from_address: from,
      to_address: recipient,
      intended_recipient: recipient,
      actual_delivery_recipient: recipient,
      subject,
      body_snapshot: html,
      sequence_step: 0,
      sent_at: sent.sentAt,
    })
    .select('id')
    .single();
  if (error || !message) {
    throw new Error(`Persistenza risposta email: ${error?.message ?? 'fallita'}`);
  }

  await args.admin.from('message_events').insert({
    workspace_id: args.workspaceId,
    message_id: message.id,
    event_type: 'SENT',
    provider_event_id: `conversation-source:${args.inboundProviderEventId}`,
    payload: {
      threadId: args.threadId,
      automatedConversation: !args.approvedByHuman,
      approvedByHuman: Boolean(args.approvedByHuman),
      inboundProviderEventId: args.inboundProviderEventId,
      providerMessageId: sent.providerMessageId,
    } as unknown as Json,
    occurred_at: sent.sentAt,
  });

  await args.admin
    .from('message_threads')
    .update({
      last_message_at: sent.sentAt,
      unread_count: 0,
      status: 'OPEN',
      updated_at: sent.sentAt,
    })
    .eq('id', args.threadId);

  return { sent: true, reason: 'EMAIL_AI_REPLY_SENT', messageId: message.id };
}
