import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { normalizeEmailAddress } from '@/lib/campaigns/test-delivery';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';

async function cancelPendingLeadJobs(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
) {
  const { data: cls } = await admin
    .from('campaign_leads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId);
  const ids = (cls ?? []).map((row) => row.id);
  if (ids.length) {
    await admin
      .from('automation_jobs')
      .update({ status: 'CANCELLED' })
      .eq('workspace_id', workspaceId)
      .in('entity_id', ids)
      .in('status', ['QUEUED', 'RETRYING']);
  }
}

/** Ferma solo i solleciti: il contatto resta SENT, non viene marcato come errore/skipped. */
export async function stopLeadFollowups(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
) {
  await admin
    .from('campaign_leads')
    .update({ next_action_at: null, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId);
  await cancelPendingLeadJobs(admin, workspaceId, leadId);
}

export async function stopLeadSequences(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
) {
  await admin
    .from('campaign_leads')
    .update({ status: 'SKIPPED', next_action_at: null, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .in('status', ['PENDING', 'GENERATING', 'READY', 'REVIEW', 'APPROVED', 'SENT']);

  await cancelPendingLeadJobs(admin, workspaceId, leadId);
}

export async function suppressLeadEmail(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
  reason: 'UNSUBSCRIBE' | 'STOP_REQUEST',
) {
  const { data: lead } = await admin
    .from('leads')
    .select('email, normalized_email')
    .eq('id', leadId)
    .maybeSingle();
  const email = lead?.normalized_email || lead?.email;
  if (!email) return { suppressed: false };
  const normalized = normalizeEmailAddress(email);
  const { data: existing } = await admin
    .from('suppression_list')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('normalized_email', normalized)
    .maybeSingle();
  if (!existing) {
    await admin.from('suppression_list').insert({
      workspace_id: workspaceId,
      email,
      normalized_email: normalized,
      reason,
      note: 'Deterministic inbound stop',
    });
  }
  await admin
    .from('leads')
    .update({ business_status: 'SUPPRESSED', updated_at: new Date().toISOString() })
    .eq('id', leadId);
  return { suppressed: true };
}

export async function scheduleFollowUpLater(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
  threadId: string,
  at: Date,
) {
  await admin
    .from('message_threads')
    .update({
      commercial_state: 'FOLLOW_UP_LATER',
      next_step: 'follow_up_later',
      next_step_at: at.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
  await admin
    .from('campaign_leads')
    .update({ updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId);
  await stopLeadFollowups(admin, workspaceId, leadId);
  const queue = new SupabaseJobQueue(admin);
  await queue.enqueue({
    workspaceId,
    jobType: 'SALES_PROACTIVE_STEP',
    entityType: 'message_thread',
    entityId: threadId,
    idempotencyKey: `SALES_PROACTIVE_STEP:message_thread:${threadId}:${at.toISOString()}`,
    inputSnapshot: { threadId, leadId, dueAt: at.toISOString() },
    priority: 40,
    notBefore: at,
  });
}
