import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

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
  return NextResponse.json({ error: 'action non supportata' }, { status: 400 });
});
