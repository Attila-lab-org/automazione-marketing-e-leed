import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export interface DashboardStats {
  leadsTotal: number;
  leadsQualified: number;
  campaignsActive: number;
  demosReady: number;
  emailsQueued: number;
  emailsSent: number;
  replies: number;
  hotInterested: number;
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`Dashboard ${label}: ${error.message}`);
}

export async function getDashboardStats(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<DashboardStats> {
  const [
    leadsRes,
    qualifiedRes,
    campaignsRes,
    demosRes,
    queuedRes,
    sentRes,
    repliesRes,
    hotRes,
  ] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('qualification_status', 'PREQUALIFIED'),
    admin
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'ACTIVE'),
    admin
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .not('demo_site_id', 'is', null),
    admin
      .from('message_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['READY', 'APPROVED']),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('direction', 'OUTBOUND')
      .not('sent_at', 'is', null),
    admin
      .from('message_events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'REPLIED'),
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('business_status', ['INTERESTED', 'WON']),
  ]);

  assertOk('leadsTotal', leadsRes.error);
  assertOk('leadsQualified', qualifiedRes.error);
  assertOk('campaignsActive', campaignsRes.error);
  assertOk('demosReady', demosRes.error);
  assertOk('emailsQueued', queuedRes.error);
  assertOk('emailsSent', sentRes.error);
  assertOk('replies', repliesRes.error);
  assertOk('hotInterested', hotRes.error);

  return {
    leadsTotal: leadsRes.count ?? 0,
    leadsQualified: qualifiedRes.count ?? 0,
    campaignsActive: campaignsRes.count ?? 0,
    demosReady: demosRes.count ?? 0,
    emailsQueued: queuedRes.count ?? 0,
    emailsSent: sentRes.count ?? 0,
    replies: repliesRes.count ?? 0,
    hotInterested: hotRes.count ?? 0,
  };
}
