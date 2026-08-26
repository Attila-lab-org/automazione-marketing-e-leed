import { NextResponse } from 'next/server';
import { runJobBatch } from '@/lib/jobs/handlers';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { runCommercialLearningCycle } from '@/lib/sales/learning';
import { enqueueDueCommercialGoalTicks } from '@/lib/sales/goals/tick';

export const runtime = 'nodejs';

/**
 * System/cron worker — NO admin cookie, NO Origin browser.
 * Auth: Authorization: Bearer $CRON_SECRET only.
 */
function authorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${cronSecret}`;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 });
  }
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: number; workerId?: string };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const goalTicks = await enqueueDueCommercialGoalTicks(admin, workspace.id).catch((error) => ({
    enqueued: 0,
    deduplicated: 0,
    error: error instanceof Error ? error.message : 'goal_tick_scan_failed',
  }));
  const results = await runJobBatch(
    admin,
    workspace.id,
    body.workerId ?? `cron-${Date.now()}`,
    body.limit ?? 20,
    process.env,
  );
  const learning = await runCommercialLearningCycle(admin, workspace.id).catch((error) => ({
    created: false,
    error: error instanceof Error ? error.message : 'learning_cycle_failed',
  }));
  return NextResponse.json({ results, processed: results.length, learning, goalTicks });
}

export const GET = run;
export const POST = run;
