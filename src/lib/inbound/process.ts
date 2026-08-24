import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { ensureInboundThread } from '@/lib/messaging/persist';
import { buildAutoReplyText } from '@/lib/inbound/auto-reply';
import {
  findLeadFromInbound,
  upsertLeadFromInbound,
} from '@/lib/inbound/create-lead';
import { classifyInboundIntent } from '@/lib/inbound/intent';
import type { TelegramInboundSettings } from '@/lib/inbound/telegram-settings';
import type {
  IntentMatch,
  NormalizedInboundMessage,
  OutboundReplyResult,
} from '@/lib/inbound/types';
import type { TelegramProvider } from '@/lib/providers/telegram';

export type ProcessInboundResult = {
  skipped?: boolean;
  reason?: string;
  leadId?: string;
  leadCreated?: boolean;
  inboundMessageId?: string;
  outboundMessageId?: string;
  replied?: boolean;
  intent?: IntentMatch;
};

const REPLY_COOLDOWN_MINUTES = 5;

function botAddress(env: NodeJS.ProcessEnv): string {
  const u = env.TELEGRAM_BOT_USERNAME?.trim();
  return u ? `@${u.replace(/^@/, '')}` : 'telegram:bot';
}

/**
 * Orchestrazione inbound:
 * 1) classifica intento
 * 2) crea/aggiorna lead se rilevante (o sempre se matched)
 * 3) salva messaggio INBOUND
 * 4) auto-reply breve se abilitato e non rate-limited
 */
export async function processTelegramInbound(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  message: NormalizedInboundMessage;
  provider: TelegramProvider;
  settings: TelegramInboundSettings;
  env?: NodeJS.ProcessEnv;
}): Promise<ProcessInboundResult> {
  const env = args.env ?? process.env;
  const { admin, workspaceId, message, provider, settings } = args;

  if (message.isFromBot) {
    return { skipped: true, reason: 'FROM_BOT' };
  }
  if (message.text.trim().startsWith('/')) {
    return { skipped: true, reason: 'BOT_COMMAND' };
  }

  // Idempotenza: stesso provider message già persistito
  const { data: existingMsg } = await admin
    .from('messages')
    .select('id')
    .eq('provider', 'telegram')
    .eq('provider_message_id', `in:${message.chatId}:${message.providerMessageId}`)
    .maybeSingle();
  if (existingMsg?.id) {
    return { skipped: true, reason: 'DUPLICATE_MESSAGE', inboundMessageId: existingMsg.id };
  }

  const intent = classifyInboundIntent(message, settings.keywords);
  const existingLeadId = await findLeadFromInbound(admin, workspaceId, message);
  if (!intent.matched && !existingLeadId) {
    return { skipped: true, reason: 'NO_INTENT', intent };
  }

  const lead = await upsertLeadFromInbound(admin, workspaceId, message, intent);
  const subject = message.isGroup
    ? `Telegram · ${message.chatTitle ?? message.chatUsername ?? message.chatId} · ${
        message.authorUsername ? `@${message.authorUsername}` : message.authorDisplayName
      }`
    : `Telegram · ${message.authorUsername ? `@${message.authorUsername}` : `tg:${message.authorId}`}`;
  const threadId = await ensureInboundThread(admin, workspaceId, lead.leadId, subject);

  const fromAddress = message.authorUsername
    ? `@${message.authorUsername}`
    : `tg:${message.authorId}`;
  const toAddress = botAddress(env);

  const { data: inboundRow, error: inboundError } = await admin
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      lead_id: lead.leadId,
      direction: 'INBOUND',
      provider: 'telegram',
      provider_message_id: `in:${message.chatId}:${message.providerMessageId}`,
      from_address: fromAddress,
      to_address: toAddress,
      intended_recipient: toAddress,
      actual_delivery_recipient: toAddress,
      subject,
      body_snapshot: message.text,
      sequence_step: 0,
      sent_at: message.occurredAt,
    })
    .select('id')
    .single();
  if (inboundError || !inboundRow) {
    throw new Error(`Inbound persist: ${inboundError?.message ?? 'fallito'}`);
  }

  await admin
    .from('message_threads')
    .update({
      status: 'NEEDS_REPLY',
      unread_count: 1,
      last_message_at: message.occurredAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'lead',
    entity_id: lead.leadId,
    lead_id: lead.leadId,
    category: 'BUSINESS',
    event_type: 'INBOUND_MESSAGE_RECEIVED',
    message: 'Messaggio inbound Telegram classificato',
    data: {
      channel: 'telegram',
      intent: intent.intent,
      keywords: intent.keywords,
      chat_id: message.chatId,
      chat_title: message.chatTitle,
      chat_username: message.chatUsername,
      is_group: message.isGroup,
      provider_message_id: message.providerMessageId,
      lead_created: lead.created,
    },
  });

  const replyText = settings.replyEnabled && intent.matched
    ? buildAutoReplyText({
        message,
        intent,
        studioName: env.OWNER_SENDER_NAME,
        template: settings.replyTemplate,
      })
    : null;
  if (!replyText) {
    const reason = !intent.matched
      ? 'FOLLOWUP_NO_AUTO_REPLY'
      : !settings.replyEnabled
        ? 'AUTO_REPLY_DISABLED'
        : 'NO_REPLY_TEMPLATE';
    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_type: 'SYSTEM',
      entity_type: 'lead',
      entity_id: lead.leadId,
      lead_id: lead.leadId,
      category: 'DECISION',
      event_type: 'TELEGRAM_REPLY_SKIPPED',
      message:
        reason === 'AUTO_REPLY_DISABLED'
          ? 'Risposta Telegram non inviata: risposta automatica disattivata'
          : reason === 'FOLLOWUP_NO_AUTO_REPLY'
            ? 'Messaggio Telegram successivo registrato senza risposta automatica'
            : 'Risposta Telegram non inviata: testo non disponibile',
      data: { reason, chat_id: message.chatId, provider_message_id: message.providerMessageId },
    });
    return {
      leadId: lead.leadId,
      leadCreated: lead.created,
      inboundMessageId: inboundRow.id,
      replied: false,
      intent,
      reason,
    };
  }

  // Protezione anti-raffica: una risposta automatica per contatto ogni 5 minuti.
  const since = new Date(Date.now() - REPLY_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { data: recentOutbound } = await admin
    .from('messages')
    .select('id')
    .eq('lead_id', lead.leadId)
    .eq('provider', 'telegram')
    .eq('direction', 'OUTBOUND')
    .gte('sent_at', since)
    .limit(1)
    .maybeSingle();
  if (recentOutbound?.id) {
    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_type: 'SYSTEM',
      entity_type: 'lead',
      entity_id: lead.leadId,
      lead_id: lead.leadId,
      category: 'DECISION',
      event_type: 'TELEGRAM_REPLY_SKIPPED',
      message: 'Risposta Telegram non inviata: attendi 5 minuti dall’ultima risposta',
      data: {
        reason: 'RATE_LIMITED',
        chat_id: message.chatId,
        provider_message_id: message.providerMessageId,
      },
    });
    return {
      leadId: lead.leadId,
      leadCreated: lead.created,
      inboundMessageId: inboundRow.id,
      replied: false,
      intent,
      reason: 'RATE_LIMITED',
    };
  }

  let send: OutboundReplyResult;
  try {
    send = await provider.reply({
      chatId: message.chatId,
      text: replyText,
      replyToMessageId: message.replyToMessageId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 300) : 'Errore sconosciuto';
    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_type: 'SYSTEM',
      entity_type: 'lead',
      entity_id: lead.leadId,
      lead_id: lead.leadId,
      category: 'TECHNICAL',
      event_type: 'TELEGRAM_REPLY_FAILED',
      message: 'Invio della risposta Telegram fallito',
      data: {
        reason: 'SEND_FAILED',
        detail,
        chat_id: message.chatId,
        provider_message_id: message.providerMessageId,
      },
    });
    return {
      leadId: lead.leadId,
      leadCreated: lead.created,
      inboundMessageId: inboundRow.id,
      replied: false,
      intent,
      reason: 'SEND_FAILED',
    };
  }

  const { data: outboundRow, error: outboundError } = await admin
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      lead_id: lead.leadId,
      direction: 'OUTBOUND',
      provider: 'telegram',
      provider_message_id: `out:${message.chatId}:${send.providerMessageId}`,
      from_address: toAddress,
      to_address: fromAddress,
      intended_recipient: fromAddress,
      actual_delivery_recipient: fromAddress,
      subject,
      body_snapshot: replyText,
      sequence_step: 0,
      sent_at: send.sentAt,
    })
    .select('id')
    .single();
  if (outboundError || !outboundRow) {
    throw new Error(`Outbound persist: ${outboundError?.message ?? 'fallito'}`);
  }

  await admin.from('message_events').insert({
    workspace_id: workspaceId,
    message_id: outboundRow.id,
    event_type: 'SENT',
    provider_event_id: `telegram-sent:${send.providerMessageId}`,
    payload: {
      channel: 'telegram',
      chat_id: message.chatId,
      reply_to: message.providerMessageId,
      intent: intent.intent,
    },
    occurred_at: send.sentAt,
  });

  await admin
    .from('message_threads')
    .update({
      status: 'OPEN',
      last_message_at: send.sentAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  await admin
    .from('leads')
    .update({
      business_status: 'CONTACTED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.leadId);

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'lead',
    entity_id: lead.leadId,
    lead_id: lead.leadId,
    category: 'BUSINESS',
    event_type: 'TELEGRAM_REPLY_SENT',
    message: 'Risposta automatica Telegram inviata',
    data: {
      chat_id: message.chatId,
      inbound_provider_message_id: message.providerMessageId,
      outbound_provider_message_id: send.providerMessageId,
    },
  });

  return {
    leadId: lead.leadId,
    leadCreated: lead.created,
    inboundMessageId: inboundRow.id,
    outboundMessageId: outboundRow.id,
    replied: true,
    intent,
  };
}
