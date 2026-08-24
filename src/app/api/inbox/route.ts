import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listInboxThreads } from '@/lib/inbound/list-inbox';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase non configurato', threads: [], source: 'unconfigured' },
      { status: 503 },
    );
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id);
  return NextResponse.json({
    threads,
    count: threads.length,
    source: 'supabase',
  });
});
