import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { stopLeadFollowups, stopLeadSequences } from '@/lib/sales/stop';

export type CloseOutKind = 'won' | 'archive' | 'drop' | 'dismiss';

export type CloseOutResult = {
  kind: CloseOutKind;
  leadId: string;
  threadId: string | null;
  leadName: string;
};

async function skipOpenCampaignWork(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
) {
  await admin
    .from('campaign_leads')
    .update({ status: 'SKIPPED', next_action_at: null, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .in('status', ['PENDING', 'GENERATING', 'READY', 'REVIEW', 'APPROVED']);
}

async function archiveLeadThreads(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
  threadId: string | null,
  extra: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  let query = admin
    .from('message_threads')
    .update({
      status: 'ARCHIVED',
      unread_count: 0,
      assigned_mode: 'HUMAN',
      updated_at: now,
      ...extra,
    })
    .eq('workspace_id', workspaceId);
  query = threadId ? query.eq('id', threadId) : query.eq('lead_id', leadId);
  await query;
}

export async function closeOutLeadWork(
  admin: AppSupabaseClient,
  workspaceId: string,
  args: {
    leadId: string;
    threadId?: string | null;
    kind: CloseOutKind;
  },
): Promise<CloseOutResult> {
  const { data: lead } = await admin
    .from('leads')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) {
    throw new Error('Contatto non trovato');
  }

  const now = new Date().toISOString();
  const threadId = args.threadId ?? null;

  if (args.kind === 'won') {
    await admin
      .from('leads')
      .update({ business_status: 'WON', updated_at: now })
      .eq('id', lead.id);
    await archiveLeadThreads(admin, workspaceId, lead.id, threadId, {
      commercial_state: 'WON',
    });
    await stopLeadSequences(admin, workspaceId, lead.id);
    return { kind: 'won', leadId: lead.id, threadId, leadName: lead.name };
  }

  if (args.kind === 'dismiss') {
    await skipOpenCampaignWork(admin, workspaceId, lead.id);
    await stopLeadFollowups(admin, workspaceId, lead.id);
    return { kind: 'dismiss', leadId: lead.id, threadId, leadName: lead.name };
  }

  if (args.kind === 'drop') {
    await admin
      .from('leads')
      .update({ business_status: 'LOST', updated_at: now })
      .eq('id', lead.id);
    await archiveLeadThreads(admin, workspaceId, lead.id, threadId, {
      commercial_state: 'NOT_INTERESTED',
    });
    await stopLeadSequences(admin, workspaceId, lead.id);
    return { kind: 'drop', leadId: lead.id, threadId, leadName: lead.name };
  }

  await archiveLeadThreads(admin, workspaceId, lead.id, threadId, {});
  await skipOpenCampaignWork(admin, workspaceId, lead.id);
  await stopLeadFollowups(admin, workspaceId, lead.id);
  return { kind: 'archive', leadId: lead.id, threadId, leadName: lead.name };
}

export function closeOutSummary(result: CloseOutResult): string {
  if (result.kind === 'won') {
    return `«${result.leadName}» è chiuso e pagato. L’ho tolto dalle code e fermato i solleciti.`;
  }
  if (result.kind === 'drop') {
    return `Ho cancellato «${result.leadName}» dalle code aperte e fermato i solleciti. Le email già inviate restano nel registro.`;
  }
  if (result.kind === 'dismiss') {
    return `Ho tolto «${result.leadName}» dalle attività da fare. I solleciti sono fermi.`;
  }
  return `Non rispondo a «${result.leadName}»: conversazione archiviata e solleciti fermati.`;
}
