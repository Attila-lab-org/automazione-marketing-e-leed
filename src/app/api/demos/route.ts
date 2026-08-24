import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createDemoFromLead } from '@/lib/demos/create';
import { listDemos } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function unconfigured() {
  return NextResponse.json({ error: 'Supabase non configurato', demos: [] }, { status: 503 });
}

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return unconfigured();
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const demos = await listDemos(admin, workspace.id);
  return NextResponse.json({ demos, count: demos.length });
});

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return unconfigured();
  }
  const body = (await request.json()) as {
    leadId?: string;
    templateKey?: string;
    layoutKey?: string;
  };
  if (!body.leadId) {
    return NextResponse.json({ error: 'leadId obbligatorio' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const demo = await createDemoFromLead(admin, workspace.id, {
    leadId: body.leadId,
    templateKey: body.templateKey,
    layoutKey: body.layoutKey,
  });
  return NextResponse.json({
    demo,
    message: demo.reused ? 'Demo esistente riaperta' : 'Demo creata',
  });
});
