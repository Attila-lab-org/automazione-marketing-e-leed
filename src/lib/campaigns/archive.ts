import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export async function archiveCampaignWork(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
  opts?: { hide?: boolean },
): Promise<{ campaignId: string; name: string; hidden: boolean }> {
  const { data: campaign, error } = await admin
    .from('campaigns')
    .select('id, name, status')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error('Campagna non trovata');

  const now = new Date().toISOString();
  const hidden = Boolean(opts?.hide);
  const nextName = hidden
    ? campaign.name.startsWith('[eliminata]')
      ? campaign.name
      : `[eliminata] ${campaign.name}`
    : campaign.name;

  const { error: updateError } = await admin
    .from('campaigns')
    .update({
      status: 'ARCHIVED',
      name: nextName,
      updated_at: now,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId);
  if (updateError) throw new Error(updateError.message);

  const { data: leads } = await admin
    .from('campaign_leads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId);
  const campaignLeadIds = (leads ?? []).map((row) => row.id);

  await admin
    .from('campaign_leads')
    .update({ status: 'SKIPPED', next_action_at: null, updated_at: now })
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .in('status', ['PENDING', 'GENERATING', 'READY', 'REVIEW', 'APPROVED']);

  await admin
    .from('campaign_leads')
    .update({ next_action_at: null, updated_at: now })
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId);

  const entityIds = [...campaignLeadIds, campaignId];
  if (entityIds.length) {
    await admin
      .from('automation_jobs')
      .update({ status: 'CANCELLED' })
      .eq('workspace_id', workspaceId)
      .in('entity_id', entityIds)
      .in('status', ['QUEUED', 'RETRYING']);
  }

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'USER',
    entity_type: 'campaign',
    entity_id: campaignId,
    category: 'DECISION',
    event_type: 'CAMPAIGN_ARCHIVED',
    message: hidden ? 'Invio nascosto dall’elenco' : 'Campagna archiviata',
    data: { previousStatus: campaign.status, hidden },
  });

  return { campaignId, name: nextName, hidden };
}
