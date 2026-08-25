import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { getTelegramProvider } from '@/lib/providers/telegram';
import { processSalesInbound } from '@/lib/sales/pipeline';
import { selectTelegramReplyText } from '@/lib/inbound/process';
import { getTelegramInboundSettings } from '@/lib/inbound/telegram-settings';

function parseInboundProviderId(value: string | null): { chatId: string; messageId: string } | null {
  if (!value?.startsWith('in:')) return null;
  const parts = value.split(':');
  if (parts.length < 3) return null;
  return { chatId: parts[1], messageId: parts.slice(2).join(':') };
}

export async function resumeTelegramAiAndReply(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ sent: boolean; reason: string }> {
  const env = args.env ?? process.env;
  const settings = await getTelegramInboundSettings(args.admin, args.workspaceId);
  if (!settings.enabled) return { sent: false, reason: 'TELEGRAM_DISABLED' };

  const { data: thread } = await args.admin
    .from('message_threads')
    .select('id, lead_id, channel')
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.threadId)
    .maybeSingle();
  if (!thread || thread.channel !== 'TELEGRAM') {
    return { sent: false, reason: 'TELEGRAM_THREAD_NOT_FOUND' };
  }
  await args.admin
    .from('message_threads')
    .update({
      assigned_mode: 'AI',
      human_required_reason: null,
      status: 'OPEN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.threadId);

  const { data: inbound } = await args.admin
    .from('messages')
    .select('id, body_snapshot, provider_message_id, from_address, to_address, subject, created_at')
    .eq('workspace_id', args.workspaceId)
    .eq('thread_id', args.threadId)
    .eq('provider', 'telegram')
    .eq('direction', 'INBOUND')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inbound) return { sent: false, reason: 'NO_INBOUND_MESSAGE' };

  const { data: alreadyReplied } = await args.admin
    .from('messages')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('thread_id', args.threadId)
    .eq('provider', 'telegram')
    .eq('direction', 'OUTBOUND')
    .gte('created_at', inbound.created_at)
    .limit(1)
    .maybeSingle();
  if (alreadyReplied) return { sent: false, reason: 'ALREADY_REPLIED' };

  const providerRef = parseInboundProviderId(inbound.provider_message_id);
  if (!providerRef) return { sent: false, reason: 'INVALID_TELEGRAM_MESSAGE_ID' };

  const sales = await processSalesInbound({
    admin: args.admin,
    workspaceId: args.workspaceId,
    threadId: args.threadId,
    leadId: thread.lead_id,
    text: inbound.body_snapshot,
    channel: 'TELEGRAM',
    env,
  });
  const selected = selectTelegramReplyText({
    salesAgentSucceeded: true,
    salesMode: sales.mode,
    salesDraft: sales.draft,
    salesHumanRequired: sales.humanRequired,
    salesStopKind: sales.classification.unsubscribe
      ? 'unsubscribe'
      : sales.classification.notInterested
        ? 'not_interested'
        : sales.classification.followUpLater
          ? 'follow_up_later'
          : null,
    legacyEnabled: false,
    intentMatched: true,
    legacyText: null,
  });
  if (!selected.text) {
    return { sent: false, reason: selected.skipReason ?? 'AI_REPLY_BLOCKED' };
  }

  const provider = getTelegramProvider(env);
  const sent = await provider.reply(
    {
      chatId: providerRef.chatId,
      text: selected.text,
      replyToMessageId: providerRef.messageId,
    },
    env,
  );

  const { data: outbound, error } = await args.admin
    .from('messages')
    .insert({
      workspace_id: args.workspaceId,
      thread_id: args.threadId,
      lead_id: thread.lead_id,
      direction: 'OUTBOUND',
      provider: 'telegram',
      provider_message_id: `out:${providerRef.chatId}:${sent.providerMessageId}`,
      from_address: inbound.to_address,
      to_address: inbound.from_address,
      intended_recipient: inbound.from_address,
      actual_delivery_recipient: inbound.from_address,
      subject: inbound.subject,
      body_snapshot: selected.text,
      sequence_step: 0,
      sent_at: sent.sentAt,
    })
    .select('id')
    .single();
  if (error || !outbound) throw new Error(`Risposta Telegram: ${error?.message ?? 'persistenza fallita'}`);

  await args.admin.from('message_events').insert({
    workspace_id: args.workspaceId,
    message_id: outbound.id,
    event_type: 'SENT',
    provider_event_id: `telegram-resume-sent:${sent.providerMessageId}`,
    payload: {
      channel: 'telegram',
      chat_id: providerRef.chatId,
      reply_to: providerRef.messageId,
      resumedByOperator: true,
    } as unknown as Json,
    occurred_at: sent.sentAt,
  });
  await args.admin
    .from('message_threads')
    .update({
      assigned_mode: 'AI',
      human_required_reason: null,
      status: 'OPEN',
      unread_count: 0,
      last_message_at: sent.sentAt,
      updated_at: sent.sentAt,
    })
    .eq('id', args.threadId);
  await args.admin.from('activity_log').insert({
    workspace_id: args.workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'lead',
    entity_id: thread.lead_id,
    lead_id: thread.lead_id,
    category: 'BUSINESS',
    event_type: 'TELEGRAM_AI_RESUMED_AND_REPLIED',
    message: 'Attila riattivato e risposta Telegram inviata',
    data: { threadId: args.threadId, outboundMessageId: outbound.id } as unknown as Json,
  });
  return { sent: true, reason: 'SENT' };
}
