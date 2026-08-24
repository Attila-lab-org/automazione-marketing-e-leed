import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createCampaignWithLeads } from '@/lib/campaigns/materialize';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato', campaigns: [] }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data, error } = await admin
    .from('campaigns')
    .select('id, name, status, mode, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message, campaigns: [] }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
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
  };
  if (!body.name?.trim() || !body.leadIds?.length) {
    return NextResponse.json({ error: 'name e leadIds obbligatori' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const created = await createCampaignWithLeads(admin, workspace.id, {
    name: body.name.trim(),
    leadIds: body.leadIds,
    mode: body.mode,
  });
  if (body.prepare !== false) {
    await enqueueCampaignPreparation(admin, workspace.id, created.campaignId);
  }
  return NextResponse.json({ ...created, message: 'Campagna creata' });
});
