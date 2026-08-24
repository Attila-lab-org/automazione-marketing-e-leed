import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import {
  listReviewQueue,
  updateCampaignLeadStatus,
  approveCampaignLeads,
  updateDraftContent,
} from '@/lib/campaigns/review-queue';
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
    action?: 'approve' | 'skip' | 'stop' | 'updateDraft';
    campaignLeadId?: string;
    campaignId?: string;
    campaignLeadIds?: string[];
    subject?: string;
    body?: string;
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  if (body.action === 'updateDraft') {
    if (!body.campaignLeadId) {
      return NextResponse.json({ error: 'campaignLeadId obbligatorio' }, { status: 400 });
    }
    try {
      const draft = await updateDraftContent(admin, workspace.id, body.campaignLeadId, {
        subject: body.subject,
        body: body.body,
      });
      return NextResponse.json({ ok: true, draft });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Aggiornamento fallito' },
        { status: 400 },
      );
    }
  }

  if (body.action === 'approve' && body.campaignId) {
    const result = await approveCampaignLeads(
      admin,
      workspace.id,
      body.campaignId,
      body.campaignLeadIds,
    );
    return NextResponse.json(result);
  }

  if (body.action === 'approve' && body.campaignLeadIds?.length) {
    const { data: rows } = await admin
      .from('campaign_leads')
      .select('id, campaign_id')
      .eq('workspace_id', workspace.id)
      .in('id', body.campaignLeadIds);
    const byCampaign = new Map<string, string[]>();
    for (const row of rows ?? []) {
      const list = byCampaign.get(row.campaign_id) ?? [];
      list.push(row.id);
      byCampaign.set(row.campaign_id, list);
    }
    let approved = 0;
    for (const [campaignId, ids] of byCampaign) {
      const result = await approveCampaignLeads(admin, workspace.id, campaignId, ids);
      approved += result.approved;
    }
    return NextResponse.json({ approved });
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
    const result = await approveCampaignLeads(admin, workspace.id, cl.campaign_id, [
      body.campaignLeadId,
    ]);
    return NextResponse.json(result);
  }

  const status = body.action === 'skip' ? 'SKIPPED' : 'STOPPED';
  await updateCampaignLeadStatus(admin, workspace.id, body.campaignLeadId, status);
  return NextResponse.json({ ok: true, status });
});
