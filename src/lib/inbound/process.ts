import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { ensureInboundThread } from '@/lib/messaging/persist';
import { buildAutoReplyText } from '@/lib/inbound/auto-reply';
import {
  findLeadFromInbound,
  telegramRequiresKeywordDiscovery,
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
import { processSalesInbound } from '@/lib/sales/pipeline';
import { scheduleFollowUpLater, stopLeadSequences, suppressLeadEmail } from '@/lib/sales/stop';
import { evaluateTelegramSendGuard } from '@/lib/inbound/telegram-send-guard';
import { recordOperatorAlert } from '@/lib/sales/reply-persist';

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

export function selectTelegramReplyText(args: {
  salesAgentSucceeded: boolean;
  salesMode: string | null;
  salesDraft: string | null;
  salesHumanRequired: boolean;
  salesStopKind: 'unsubscribe' | 'not_interested' | 'follow_up_later' | null;
  legacyEnabled: boolean;
  intentMatched: boolean;
  legacyText: string | null;
}): { text: string | null; source: 'sales_ai' | 'legacy' | 'none'; skipReason: string | null } {
  if (args.salesAgentSucceeded) {
    if (args.salesStopKind === 'unsubscribe') {
      return { text: null, source: 'none', skipReason: 'UNSUBSCRIBE' };
    }
    if (args.salesStopKind === 'not_interested') {
      return { text: null, source: 'none', skipReason: 'NOT_INTERESTED' };
    }
    if (args.salesStopKind === 'follow_up_later') {
      return { text: null, source: 'none', skipReason: 'FOLLOW_UP_LATER' };
    }
    if (args.salesMode === 'HUMAN_ONLY') {
      return { text: null, source: 'none', skipReason: 'HUMAN_ONLY' };
    }
    if (args.salesMode === 'APPROVAL_REQUIRED') {
      return { text: null, source: 'none', skipReason: 'APPROVAL_REQUIRED' };
    }
    if (args.salesMode === 'DRAFT_ONLY') {
      return { text: null, source: 'none', skipReason: 'DRAFT_ONLY' };
    }
    if (args.salesHumanRequired) {
      return { text: null, source: 'none', skipReason: 'HUMAN_ONLY' };
    }
    if (args.salesMode === 'AUTO_ALLOWED' && args.salesDraft) {
      return { text: args.salesDraft, source: 'sales_ai', skipReason: null };
    }
    if (args.salesMode === 'AUTO_ALLOWED' && !args.salesDraft) {
      return { text: null, source: 'none', skipReason: 'SALES_DRAFT_MISSING' };
    }
    return { text: null, source: 'none', skipReason: args.salesMode ?? 'SALES_POLICY' };
  }
  if (args.legacyEnabled && args.intentMatched && args.legacyText) {
    return { text: args.legacyText, source: 'legacy', skipReason: null };
  }
  if (!args.legacyEnabled) return { text: null, source: 'none', skipReason: 'AUTO_REPLY_DISABLED' };
  if (!args.intentMatched) return { text: null, source: 'none', skipReason: 'FOLLOWUP_NO_AUTO_REPLY' };
  return { text: null, source: 'none', skipReason: 'NO_REPLY_TEMPLATE' };
}

function skipMessageForReason(reason: string): string {
  switch (reason) {
    case 'AUTO_REPLY_DISABLED':
    case 'MANUAL_MODE':
      return 'Risposta Telegram non inviata: gestione manuale attiva';
    case 'TELEGRAM_STOPPED':
      return 'Risposta Telegram non inviata: Telegram è fermo';
    case 'RATE_LIMIT':
      return 'Risposta Telegram non inviata: limite frequenza';
    case 'DUPLICATE_OUTBOUND':
      return 'Risposta Telegram non inviata: messaggio duplicato';
    case 'LOW_CONFIDENCE':
      return 'Risposta Telegram non inviata: sicurezza bassa, bozza da controllare';
    case 'CRITICAL_HANDOFF':
      return 'Risposta Telegram non inviata: richiesta delicata, serve te';
    case 'HUMAN_TAKEOVER':
    case 'HUMAN_ONLY':
      return 'Risposta Telegram non inviata: HUMAN_ONLY, conversazione in carico all’operatore';
    case 'APPROVAL_REQUIRED':
      return 'Bozza Attila AI in Messaggi: APPROVAL_REQUIRED, nessun invio automatico';
    case 'DRAFT_ONLY':
      return 'Bozza Attila AI salvata: DRAFT_ONLY, nessun invio automatico';
    case 'FOLLOW_UP_LATER':
      return 'Follow-up pianificato: nessun invio immediato';
    case 'UNSUBSCRIBE':
    case 'NOT_INTERESTED':
      return 'Stop deterministico: nessun invio commerciale';
    case 'SALES_DRAFT_MISSING':
    case 'NO_DRAFT':
      return 'AUTO_ALLOWED senza bozza vendibile: nessun invio';
    case 'FOLLOWUP_NO_AUTO_REPLY':
      return 'Messaggio Telegram successivo registrato senza risposta automatica';
    case 'NO_REPLY_TEMPLATE':
      return 'Risposta Telegram non inviata: testo legacy non disponibile';
    default:
      return 'Risposta Telegram non inviata: policy commerciale';
  }
}

function botAddress(env: NodeJS.ProcessEnv): string {
  const u = env.TELEGRAM_BOT_USERNAME?.trim();
  return u ? `@${u.replace(/^@/, '')}` : 'telegram:bot';
}

/**
 * Orchestrazione inbound:
 * 1) classifica intento
 * 2) crea/aggiorna lead se rilevante (o sempre se matched)
 * 3) salva messaggio INBOUND
 * 4) risponde una volta a ogni nuovo messaggio, se consentito dalla policy
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
  if (telegramRequiresKeywordDiscovery(intent.matched, existingLeadId)) {
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

  let salesDraft: string | null = null;
  let salesMode: string | null = null;
  let salesAgentUsed = false;
  let salesHumanRequired = false;
  let salesConfidence: number | null = null;
  let salesStopKind: 'unsubscribe' | 'not_interested' | 'follow_up_later' | null = null;
  try {
    const sales = await processSalesInbound({
      admin,
      workspaceId,
      threadId,
      leadId: lead.leadId,
      text: message.text,
      channel: 'TELEGRAM',
      env,
    });
    salesDraft = sales.draft;
    salesMode = sales.mode;
    salesHumanRequired = sales.humanRequired;
    salesConfidence = sales.classification.confidence;
    salesAgentUsed = true;
    if (sales.classification.unsubscribe) {
      await suppressLeadEmail(admin, workspaceId, lead.leadId, 'UNSUBSCRIBE');
      await stopLeadSequences(admin, workspaceId, lead.leadId);
      salesStopKind = 'unsubscribe';
    } else if (sales.classification.notInterested) {
      await stopLeadSequences(admin, workspaceId, lead.leadId);
      salesStopKind = 'not_interested';
    } else if (sales.classification.followUpLater) {
      const at = new Date();
      at.setMonth(at.getMonth() + 1);
      await scheduleFollowUpLater(admin, workspaceId, lead.leadId, threadId, at);
      salesStopKind = 'follow_up_later';
    }
  } catch (err) {
    console.error('sales inbound pipeline failed', err);
  }

  await admin
    .from('message_threads')
    .update({
      last_message_at: message.occurredAt,
      unread_count: 1,
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

  const legacyText =
    !salesAgentUsed && settings.replyEnabled
      ? buildAutoReplyText({
          message,
          intent,
          studioName: env.OWNER_SENDER_NAME,
          template: settings.replyTemplate,
        })
      : null;
  const chosen = selectTelegramReplyText({
    salesAgentSucceeded: salesAgentUsed,
    salesMode,
    salesDraft,
    salesHumanRequired,
    salesStopKind,
    legacyEnabled: settings.replyEnabled,
    intentMatched: intent.matched,
    legacyText,
  });
  let replyText = chosen.text;
  let skipReason = chosen.skipReason;

  if (replyText) {
    const guard = await evaluateTelegramSendGuard({
      admin,
      workspaceId,
      threadId,
      settings,
      draft: replyText,
      salesMode,
      salesHumanRequired,
      classificationConfidence: salesConfidence,
    });
    if (!guard.allowed) {
      replyText = null;
      skipReason = guard.reason;
      await admin.from('activity_log').insert({
        workspace_id: workspaceId,
        actor_type: 'SYSTEM',
        entity_type: 'lead',
        entity_id: lead.leadId,
        lead_id: lead.leadId,
        category: 'DECISION',
        event_type: 'TELEGRAM_SEND_GUARD_BLOCKED',
        message: guard.message,
        data: {
          reason: guard.reason,
          salesMode,
          chat_id: message.chatId,
          provider_message_id: message.providerMessageId,
        },
      });
      if (
        guard.reason === 'MANUAL_MODE' ||
        guard.reason === 'LOW_CONFIDENCE' ||
        guard.reason === 'CRITICAL_HANDOFF' ||
        guard.reason === 'HUMAN_TAKEOVER'
      ) {
        await recordOperatorAlert({
          admin,
          workspaceId,
          leadId: lead.leadId,
          threadId,
          kind: 'telegram_draft_blocked',
          message: guard.message,
        });
      }
    }
  }

  if (!replyText) {
    const reason = skipReason ?? 'SALES_POLICY';
    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_type: 'SYSTEM',
      entity_type: 'lead',
      entity_id: lead.leadId,
      lead_id: lead.leadId,
      category: 'DECISION',
      event_type: 'TELEGRAM_REPLY_SKIPPED',
      message: skipMessageForReason(reason),
      data: {
        reason,
        salesMode,
        source: chosen.source,
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
      reason,
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
      threadId,
      inbound_provider_message_id: message.providerMessageId,
      outbound_provider_message_id: send.providerMessageId,
      why: 'Controlli superati: risposta automatica protetta',
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
