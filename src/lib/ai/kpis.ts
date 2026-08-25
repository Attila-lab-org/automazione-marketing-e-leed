import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export type AiKpis = {
  spendUsd: number;
  analyzedLeads: number;
  aiWrittenMessages: number;
  criticPass: number;
  aiReplies: number;
  humanHandoffs: number;
};

export async function getAiKpis(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<AiKpis> {
  const [spend, analyzed, written, critic, replies, handoffs] = await Promise.all([
    admin
      .from('ai_runs')
      .select('estimated_cost_usd')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ok'),
    admin
      .from('website_analyses')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    admin
      .from('ai_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('task_type', 'draft_outbound')
      .eq('status', 'ok'),
    admin
      .from('ai_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('task_type', 'critique_outbound')
      .eq('status', 'ok'),
    admin
      .from('ai_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('task_type', 'draft_reply')
      .eq('status', 'ok'),
    admin
      .from('message_threads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('commercial_state', 'HUMAN_REQUIRED'),
  ]);

  const spendUsd = (spend.data ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
    0,
  );

  return {
    spendUsd: Number(spendUsd.toFixed(4)),
    analyzedLeads: analyzed.count ?? 0,
    aiWrittenMessages: written.count ?? 0,
    criticPass: critic.count ?? 0,
    aiReplies: replies.count ?? 0,
    humanHandoffs: handoffs.count ?? 0,
  };
}
