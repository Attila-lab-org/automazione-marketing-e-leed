import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { DEFAULT_PLAYBOOK, mergePlaybook } from '@/lib/sales/playbook';
import { getCurrentPlaybook, saveCurrentPlaybook } from '@/lib/sales/playbook-store';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ playbook: DEFAULT_PLAYBOOK });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const playbook = await getCurrentPlaybook(admin, workspace.id);
  return NextResponse.json({ playbook });
});

export const PUT = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const body = await request.json();
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const playbook = await saveCurrentPlaybook(admin, workspace.id, mergePlaybook(body.playbook ?? body));
  return NextResponse.json({ playbook });
});
