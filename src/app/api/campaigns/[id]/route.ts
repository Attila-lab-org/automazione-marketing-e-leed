import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { resumeCampaign } from '@/lib/campaigns/resume';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  const { data: campaign, error } = await admin
    .from('campaigns')
    .select('id, name, status, mode, created_at, updated_at, rate_limit_per_hour, daily_send_limit')
    .eq('workspace_id', workspace.id)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: 'Campagna non trovata' }, { status: 404 });

  const { data: leads, error: leadsError } = await admin
    .from('campaign_leads')
    .select('status')
    .eq('workspace_id', workspace.id)
    .eq('campaign_id', id);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of leads ?? []) {
    const s = row.status ?? 'UNKNOWN';
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return NextResponse.json({
    campaign,
    counts,
    totals: {
      leads: leads?.length ?? 0,
      review: counts.REVIEW ?? 0,
      ready: counts.READY ?? 0,
      approved: counts.APPROVED ?? 0,
      pending: counts.PENDING ?? 0,
      generating: counts.GENERATING ?? 0,
      failed: counts.FAILED ?? 0,
      skipped: counts.SKIPPED ?? 0,
      sent: counts.SENT ?? 0,
    },
  });
});

export const PATCH = withAdmin(async (request: Request, ctx?: unknown) => {
  const { id } = await (ctx as RouteCtx).params;
  const body = (await request.json()) as { action?: string; campaignLeadIds?: string[] };
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  if (body.action === 'prepare') {
    const result = await enqueueCampaignPreparation(admin, workspace.id, id);
    return NextResponse.json(result);
  }
  if (body.action === 'approve') {
    const result = await approveCampaignLeads(admin, workspace.id, id, body.campaignLeadIds);
    return NextResponse.json(result);
  }
  if (body.action === 'pause') {
    const { error } = await admin
      .from('campaigns')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'PAUSED' });
  }
  if (body.action === 'resume') {
    try {
      const result = await resumeCampaign(admin, workspace.id, id);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resume fallito';
      const status = message === 'Campagna non trovata' ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }
  return NextResponse.json({ error: 'action non supportata' }, { status: 400 });
});
