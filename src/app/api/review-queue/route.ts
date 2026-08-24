import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listReviewQueue, updateCampaignLeadStatus, approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato', items: [] }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const items = await listReviewQueue(admin, workspace.id, appUrl);
  return NextResponse.json({ items, count: items.length });
});

export const PATCH = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as {
    action?: 'approve' | 'skip' | 'stop';
    campaignLeadId?: string;
    campaignId?: string;
    campaignLeadIds?: string[];
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  if (body.action === 'approve' && body.campaignId) {
    const result = await approveCampaignLeads(
      admin,
      workspace.id,
      body.campaignId,
      body.campaignLeadIds,
    );
    return NextResponse.json(result);
  }

  if (!body.campaignLeadId || !body.action) {
    return NextResponse.json({ error: 'campaignLeadId e action obbligatori' }, { status: 400 });
  }

  if (body.action === 'approve') {
    const { data: cl } = await admin
      .from('campaign_leads')
      .select('campaign_id')
      .eq('id', body.campaignLeadId)
      .single();
    if (!cl) return NextResponse.json({ error: 'Lead campagna non trovato' }, { status: 404 });
    const result = await approveCampaignLeads(admin, workspace.id, cl.campaign_id, [body.campaignLeadId]);
    return NextResponse.json(result);
  }

  const status = body.action === 'skip' ? 'SKIPPED' : 'STOPPED';
  await updateCampaignLeadStatus(admin, workspace.id, body.campaignLeadId, status);
  return NextResponse.json({ ok: true, status });
});
