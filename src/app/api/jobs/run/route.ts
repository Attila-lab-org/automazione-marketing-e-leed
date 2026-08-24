import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { runJobBatch } from '@/lib/jobs/handlers';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function authorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export const POST = withAdmin(async (request: Request) => {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'CRON_SECRET non valido' }, { status: 403 });
  }
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: number; workerId?: string };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const results = await runJobBatch(
    admin,
    workspace.id,
    body.workerId ?? `worker-${Date.now()}`,
    body.limit ?? 10,
    process.env,
  );
  return NextResponse.json({ results, processed: results.length });
});
