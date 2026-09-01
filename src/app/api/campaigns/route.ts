import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createCampaignWithLeads } from '@/lib/campaigns/materialize';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato', campaigns: [] }, { status: 503 });
  }
  const archivedOnly = new URL(request.url).searchParams.get('archived') === '1';
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  let query = admin
    .from('campaigns')
    .select('id, name, status, mode, delivery_mode, test_recipient, created_at, updated_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false });
  query = archivedOnly ? query.eq('status', 'ARCHIVED') : query.neq('status', 'ARCHIVED');
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message, campaigns: [] }, { status: 500 });
  const visible = (data ?? []).filter((campaign) => !campaign.name.startsWith('[eliminata]'));
  const campaignIds = visible.map((campaign) => campaign.id);
  const { data: memberships } = campaignIds.length
    ? await admin
        .from('campaign_leads')
        .select('campaign_id, lead_id')
        .eq('workspace_id', workspace.id)
        .in('campaign_id', campaignIds)
    : { data: [] };
  const leadIds = [...new Set((memberships ?? []).map((row) => row.lead_id))];
  const { data: leads } = leadIds.length
    ? await admin
        .from('leads')
        .select('id, category')
        .eq('workspace_id', workspace.id)
        .in('id', leadIds)
    : { data: [] };
  const categoryByLead = new Map((leads ?? []).map((lead) => [lead.id, lead.category]));
  const membershipsByCampaign = new Map<
    string,
    Array<{ campaign_id: string; lead_id: string }>
  >();
  for (const membership of memberships ?? []) {
    const current = membershipsByCampaign.get(membership.campaign_id) ?? [];
    current.push(membership);
    membershipsByCampaign.set(membership.campaign_id, current);
  }
  const campaigns = visible.map((campaign) => {
    const campaignMemberships = membershipsByCampaign.get(campaign.id) ?? [];
    return {
      ...campaign,
      lead_count: campaignMemberships.length,
      categories: [
        ...new Set(
          campaignMemberships
            .map((membership) => categoryByLead.get(membership.lead_id))
            .filter((category): category is string => Boolean(category)),
        ),
      ],
    };
  });
  return NextResponse.json({ campaigns });
});

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as {
    name?: string;
    leadIds?: string[];
    mode?: 'MANUAL' | 'SCORE_BASED' | 'FULL_AUTO';
    prepare?: boolean;
    deliveryMode?: 'PRODUCTION' | 'TEST';
    testRecipient?: string;
  };
  if (!body.name?.trim() || !body.leadIds?.length) {
    return NextResponse.json({ error: 'name e leadIds obbligatori' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  try {
    const created = await createCampaignWithLeads(admin, workspace.id, {
      name: body.name.trim(),
      leadIds: body.leadIds,
      mode: body.mode,
      deliveryMode: body.deliveryMode,
      testRecipient: body.testRecipient,
    });
    if (body.prepare !== false) {
      await enqueueCampaignPreparation(admin, workspace.id, created.campaignId);
    }
    return NextResponse.json({ ...created, message: 'Campagna creata' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Creazione fallita' },
      { status: 400 },
    );
  }
});
