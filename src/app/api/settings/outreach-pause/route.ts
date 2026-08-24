import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getOutreachPausedAll, setOutreachPausedAll } from '@/lib/settings/outreach-pause';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ paused: true, source: 'unconfigured' });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const paused = await getOutreachPausedAll(admin, workspace.id);
  return NextResponse.json({ paused, workspaceId: workspace.id });
});

export const PATCH = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as { paused?: boolean; reason?: string };
  if (typeof body.paused !== 'boolean') {
    return NextResponse.json({ error: 'paused boolean obbligatorio' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  await setOutreachPausedAll(admin, workspace.id, body.paused, body.reason);
  return NextResponse.json({ paused: body.paused, message: body.paused ? 'Outreach in pausa' : 'Outreach riattivato' });
});
