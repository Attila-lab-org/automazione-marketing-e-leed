import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { sourceTypeForChannel } from '@/lib/inbound/channels';
import type { IntentMatch, NormalizedInboundMessage } from '@/lib/inbound/types';

export type InboundLeadResult = {
  leadId: string;
  created: boolean;
  contactValue: string;
};

function contactValue(message: NormalizedInboundMessage): string {
  if (message.authorUsername) return `@${message.authorUsername}`;
  return `tg:${message.authorId}`;
}

function contactNormalized(message: NormalizedInboundMessage): string {
  return `telegram:${message.authorId}`;
}

function sourceSnapshot(message: NormalizedInboundMessage, intent: IntentMatch) {
  return {
    channel: message.channel,
    chat_id: message.chatId,
    chat_type: message.chatType,
    chat_title: message.chatTitle,
    chat_username: message.chatUsername,
    author_id: message.authorId,
    author_username: message.authorUsername,
    author_display_name: message.authorDisplayName,
    intent: intent.intent,
    keywords: intent.keywords,
    text_preview: message.text.slice(0, 280),
    is_group: message.isGroup,
    provider_message_id: message.providerMessageId,
    last_message_at: message.occurredAt,
  };
}

export async function findLeadFromInbound(
  admin: AppSupabaseClient,
  workspaceId: string,
  message: NormalizedInboundMessage,
): Promise<string | null> {
  const { data, error } = await admin
    .from('lead_sources')
    .select('lead_id')
    .eq('workspace_id', workspaceId)
    .eq('source_type', sourceTypeForChannel(message.channel))
    .eq('external_id', message.authorId)
    .maybeSingle();
  if (error) throw new Error(`Inbound lead lookup: ${error.message}`);
  if (data?.lead_id) return data.lead_id;

  const { data: contact } = await admin
    .from('lead_contacts')
    .select('lead_id')
    .eq('workspace_id', workspaceId)
    .eq('normalized_value', contactNormalized(message))
    .maybeSingle();
  if (contact?.lead_id) return contact.lead_id;

  const { data: prior } = await admin
    .from('messages')
    .select('lead_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'telegram')
    .eq('direction', 'INBOUND')
    .like('provider_message_id', `in:${message.chatId}:%`)
    .not('lead_id', 'is', null)
    .limit(1)
    .maybeSingle();
  return prior?.lead_id ?? null;
}

/**
 * Keyword = discovery / valutazione opportunità.
 * Se il contatto ha già un Sales Thread / lead inbound,
 * il follow-up non deve rimatchare le keyword iniziali.
 */
export function telegramRequiresKeywordDiscovery(
  intentMatched: boolean,
  existingLeadId: string | null,
): boolean {
  return !intentMatched && !existingLeadId;
}

/**
 * Crea o riusa un lead da un messaggio Telegram.
 * Dedupe su lead_sources.external_id = telegram user id.
 */
export async function upsertLeadFromInbound(
  admin: AppSupabaseClient,
  workspaceId: string,
  message: NormalizedInboundMessage,
  intent: IntentMatch,
): Promise<InboundLeadResult> {
  const sourceType = sourceTypeForChannel(message.channel);
  const externalId = message.authorId;
  const value = contactValue(message);
  const normalized = contactNormalized(message);

  const existingLeadId = await findLeadFromInbound(admin, workspaceId, message);
  if (existingLeadId) {
    await admin
      .from('leads')
      .update({
        processing_status: 'IDLE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingLeadId);
    const { data: existingSource } = await admin
      .from('lead_sources')
      .select('lead_id')
      .eq('workspace_id', workspaceId)
      .eq('source_type', sourceType)
      .eq('external_id', externalId)
      .maybeSingle();
    if (existingSource?.lead_id) {
      await admin
        .from('lead_sources')
        .update({ query_snapshot: sourceSnapshot(message, intent) })
        .eq('workspace_id', workspaceId)
        .eq('source_type', sourceType)
        .eq('external_id', externalId);
    } else {
      await admin.from('lead_sources').insert({
        workspace_id: workspaceId,
        lead_id: existingLeadId,
        source_type: sourceType,
        external_id: externalId,
        query_snapshot: sourceSnapshot(message, intent),
      });
    }
    return {
      leadId: existingLeadId,
      created: false,
      contactValue: value,
    };
  }

  const name = message.authorDisplayName || value;
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      workspace_id: workspaceId,
      name,
      category: 'inbound_request',
      subcategory: intent.intent,
      business_status: 'NEW',
      processing_status: 'IDLE',
      current_score: intent.matched ? 70 : 40,
      current_confidence: intent.confidence || 30,
      discovery_score: intent.matched ? 70 : 40,
      discovery_confidence: intent.confidence || 30,
      qualification_status: intent.matched ? 'NEEDS_ANALYSIS' : 'NEW',
      offer_candidate: intent.matched
        ? intent.intent === 'ECOMMERCE_REQUEST'
          ? 'ecommerce'
          : 'website'
        : null,
      qualification_reasons: [
        {
          code: 'INBOUND_CHANNEL',
          label: `Richiesta da ${message.channel}`,
          scoreDelta: intent.matched ? 20 : 0,
          confidenceDelta: 20,
        },
        ...(intent.keywords.length
          ? [
              {
                code: 'INBOUND_INTENT',
                label: `Intento rilevato: ${intent.intent}`,
                scoreDelta: 15,
                confidenceDelta: 15,
              },
            ]
          : []),
      ],
      qualification_algorithm_version: 'inbound-v1',
      qualified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !lead) {
    throw new Error(`Inbound lead: ${error?.message ?? 'inserimento fallito'}`);
  }

  const { error: contactError } = await admin.from('lead_contacts').insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    type: 'OTHER',
    value,
    normalized_value: normalized,
    label: message.channel,
    is_primary: true,
    source: 'TELEGRAM',
  });
  if (contactError) {
    await admin.from('leads').delete().eq('id', lead.id);
    throw new Error(`Inbound contact: ${contactError.message}`);
  }

  const { error: sourceError } = await admin.from('lead_sources').insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    source_type: sourceType,
    external_id: externalId,
    query_snapshot: sourceSnapshot(message, intent),
  });
  if (sourceError) {
    await admin.from('lead_contacts').delete().eq('lead_id', lead.id);
    await admin.from('leads').delete().eq('id', lead.id);
    throw new Error(`Inbound source: ${sourceError.message}`);
  }

  return { leadId: lead.id, created: true, contactValue: value };
}
