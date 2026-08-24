import type { SupabaseClient } from '@supabase/supabase-js';

export async function ensureMessageThread(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
  campaignId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('message_threads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await admin
    .from('message_threads')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      campaign_id: campaignId,
      status: 'OPEN',
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`Thread: creazione fallita — ${error?.message ?? ''}`);
  return created.id;
}

/**
 * Thread inbound senza campagna (Telegram / social).
 * Chiave logica: workspace + lead con campaign_id null (indice univoco 0021).
 */
export async function ensureInboundThread(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
  subject: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('message_threads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .is('campaign_id', null)
    .maybeSingle();
  if (existing?.id) {
    await admin
      .from('message_threads')
      .update({
        subject,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await admin
    .from('message_threads')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      campaign_id: null,
      subject,
      status: 'NEEDS_REPLY',
      unread_count: 1,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(`Inbound thread: creazione fallita — ${error?.message ?? ''}`);
  }
  return created.id;
}
