import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listInboxThreads } from '@/lib/inbound/list-inbox';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase non configurato', threads: [], source: 'unconfigured' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const channelParam = url.searchParams.get('channel');
  const channel =
    channelParam === 'telegram' || channelParam === 'email' ? channelParam : 'all';
  const includeArchived = url.searchParams.get('archived') === '1';

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id, {
    channel,
    includeArchived,
  });
  return NextResponse.json({
    threads,
    count: threads.length,
    source: 'supabase',
    channel,
    includeArchived,
  });
});
