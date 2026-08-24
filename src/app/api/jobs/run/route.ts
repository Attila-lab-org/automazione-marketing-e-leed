import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { runJobBatch } from '@/lib/jobs/handlers';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

/**
 * DEV / admin-only manual worker flush.
 * Production cron MUST use `/api/cron/jobs` with Bearer CRON_SECRET (no admin cookie).
 */
export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: number; workerId?: string };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const results = await runJobBatch(
    admin,
    workspace.id,
    body.workerId ?? `admin-manual-${Date.now()}`,
    body.limit ?? 10,
    process.env,
  );
  return NextResponse.json({
    results,
    processed: results.length,
    note: 'Admin manual flush — production cron is POST/GET /api/cron/jobs',
  });
});
