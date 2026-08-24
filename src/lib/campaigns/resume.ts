import type { AppSupabaseClient } from '@/lib/types/supabase-database';

/**
 * Resume a PAUSED campaign and release deferred jobs waiting on CAMPAIGN_PAUSED
 * so they become claimable immediately (no attempt burn).
 * Does NOT touch automation_jobs.updated_at (column does not exist in 0007).
 */
export async function resumeCampaign(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
): Promise<{ ok: true; status: 'ACTIVE'; releasedJobs: number }> {
  const { data: campaign, error: readError } = await admin
    .from('campaigns')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!campaign) throw new Error('Campagna non trovata');

  const { error } = await admin
    .from('campaigns')
    .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId);
  if (error) throw new Error(error.message);

  const releasedJobs = await releasePausedDeferredJobs(admin, workspaceId, campaignId);
  return { ok: true, status: 'ACTIVE', releasedJobs };
}

async function releasePausedDeferredJobs(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  const { data: leads, error: leadsError } = await admin
    .from('campaign_leads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId);

  if (leadsError) throw new Error(`Resume: campaign_leads — ${leadsError.message}`);

  const entityIds = (leads ?? []).map((l) => l.id);
  if (entityIds.length === 0) return 0;

  const now = new Date().toISOString();
  const { data: jobs, error } = await admin
    .from('automation_jobs')
    .update({
      next_retry_at: now,
    })
    .eq('workspace_id', workspaceId)
    .eq('status', 'QUEUED')
    .eq('error_code', 'DEFERRED')
    .in('entity_id', entityIds)
    .ilike('error_detail', '%CAMPAIGN_PAUSED%')
    .select('id');

  if (error) {
    throw new Error(`Resume: release deferred jobs fallito — ${error.message}`);
  }
  return jobs?.length ?? 0;
}
