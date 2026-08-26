import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';

export async function enqueueCampaignPreparation(
  admin: SupabaseClient,
  workspaceId: string,
  campaignId: string,
) {
  const { data: leads, error } = await admin
    .from('campaign_leads')
    .select('id, lead_id, status')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .in('status', ['PENDING', 'FAILED']);

  if (error) throw new Error(`Prepare: lettura campaign_leads fallita — ${error.message}`);

  const queue = new SupabaseJobQueue(admin);
  const batch = await queue.enqueueMany(
    (leads ?? []).map((cl) => ({
      workspaceId,
      jobType: 'LEAD_ENRICHMENT',
      entityType: 'campaign_lead',
      entityId: cl.id,
      idempotencyKey: `LEAD_ENRICHMENT:campaign_lead:${cl.id}`,
      inputSnapshot: { campaignId, leadId: cl.lead_id },
      priority: 50,
    })),
  );

  await admin.from('campaigns').update({ status: 'ACTIVE' }).eq('id', campaignId);

  return { enqueued: batch.inserted, deduplicated: batch.deduplicated };
}
