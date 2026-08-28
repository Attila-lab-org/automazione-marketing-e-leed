import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listDueManualFollowups } from '@/lib/ai/operator/ops-writes';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato', items: [] }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  const now = Date.now();
  const { data: rows } = await admin
    .from('campaign_leads')
    .select('id, campaign_id, lead_id, sequence_step, next_action_at, status')
    .eq('workspace_id', workspace.id)
    .in('status', ['SENT', 'REVIEW'])
    .gte('sequence_step', 1)
    .not('next_action_at', 'is', null)
    .order('next_action_at', { ascending: true })
    .limit(80);

  if (!rows?.length) return NextResponse.json({ items: [] });

  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  const [{ data: leads }, { data: campaigns }, { data: inbound }] = await Promise.all([
    admin.from('leads').select('id, name').in('id', leadIds),
    admin.from('campaigns').select('id, name, status').in('id', campaignIds),
    admin
      .from('messages')
      .select('lead_id')
      .eq('workspace_id', workspace.id)
      .eq('direction', 'INBOUND')
      .in('lead_id', leadIds),
  ]);
  const leadById = new Map((leads ?? []).map((l) => [l.id, l.name]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const replied = new Set((inbound ?? []).map((m) => m.lead_id));

  const items: Array<{
    campaignLeadId: string;
    campaignId: string;
    campaignName: string;
    leadName: string;
    sequenceStep: number;
    nextActionAt: string | null;
    status: string;
    due: boolean;
    inReview: boolean;
  }> = rows
    .filter((row) => {
      if (replied.has(row.lead_id)) return false;
      const campaign = campaignById.get(row.campaign_id);
      if (!campaign || campaign.status === 'ARCHIVED') return false;
      return true;
    })
    .map((row) => {
      const availableAt = row.next_action_at ? new Date(row.next_action_at).getTime() : 0;
      return {
        campaignLeadId: row.id,
        campaignId: row.campaign_id,
        campaignName: campaignById.get(row.campaign_id)?.name ?? 'Campagna',
        leadName: leadById.get(row.lead_id) ?? 'Contatto',
        sequenceStep: row.sequence_step ?? 1,
        nextActionAt: row.next_action_at,
        status: String(row.status),
        due: availableAt <= now && row.status === 'SENT',
        inReview: row.status === 'REVIEW',
      };
    });

  const dueHelper = await listDueManualFollowups(admin, workspace.id);
  const seen = new Set(items.map((i) => i.campaignLeadId));
  for (const row of dueHelper) {
    if (seen.has(row.campaignLeadId)) continue;
    items.push({
      campaignLeadId: row.campaignLeadId,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      leadName: row.leadName,
      sequenceStep: row.sequenceStep,
      nextActionAt: row.nextActionAt,
      status: String(row.status),
      due: true,
      inReview: row.status === 'REVIEW',
    });
  }

  return NextResponse.json({ items });
});
