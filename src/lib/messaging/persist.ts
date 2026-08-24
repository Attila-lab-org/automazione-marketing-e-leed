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
