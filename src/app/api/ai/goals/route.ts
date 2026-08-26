import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import {
  createCommercialGoal,
  getActiveGoalPlan,
  getLatestCommercialGoal,
  transitionCommercialGoal,
} from '@/lib/sales/goals/store';
import { enqueueDueCommercialGoalTicks } from '@/lib/sales/goals/tick';
import { createAdminSupabaseClient } from '@/lib/supabase/client';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import { z } from 'zod';

const createGoalSchema = z.object({
  targetValue: z.number().int().min(1).max(10_000),
  offerKey: z.string().trim().min(2).max(160),
  deadline: z.string().datetime(),
  targetMetric: z
    .enum(['DEALS_WON', 'APPOINTMENTS_BOOKED', 'POSITIVE_REPLIES', 'QUALIFIED_LEADS'])
    .default('DEALS_WON'),
  mode: z.enum(['ASK', 'DO', 'AUTOPILOT']).default('DO'),
  city: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
});

export const GET = withAdmin(async () => {
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const goal = await getLatestCommercialGoal(admin, workspace.id);
  const plan = goal ? await getActiveGoalPlan(admin, goal.id) : null;
  return NextResponse.json({ goal, plan, active: goal?.status === 'ACTIVE' });
});

export const POST = withAdmin(async (request: Request) => {
  const parsed = createGoalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Obiettivo non valido', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const input = parsed.data;
  const goal = await createCommercialGoal(admin, workspace.id, {
    title: `${input.targetValue} ${input.targetMetric.toLowerCase().replaceAll('_', ' ')} · ${input.offerKey}`,
    offerKey: input.offerKey,
    targetMetric: input.targetMetric,
    targetValue: input.targetValue,
    deadline: input.deadline,
    market: { city: input.city ?? null, category: input.category ?? null },
    mode: input.mode,
    constraints: { dailySendLimit: 50, requireDemo: true, shadowMode: true },
  });
  const queued = await new SupabaseJobQueue(admin).enqueue({
    workspaceId: workspace.id,
    jobType: 'COMMERCIAL_GOAL_TICK',
    entityType: 'commercial_goal',
    entityId: goal.id,
    idempotencyKey: `COMMERCIAL_GOAL_TICK:${goal.id}:onboarding`,
    inputSnapshot: { goalId: goal.id, trigger: 'dashboard_onboarding' },
    priority: 10,
  });
  return NextResponse.json({ goal, queued: !queued.deduplicated }, { status: 201 });
});

export const PATCH = withAdmin(async (request: Request) => {
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    mode?: string;
    goalId?: string;
  };
  const { data: goal } = body.goalId
    ? await admin
        .from('commercial_goals')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('id', body.goalId)
        .maybeSingle()
    : { data: await getLatestCommercialGoal(admin, workspace.id) };
  if (!goal) return NextResponse.json({ error: 'Goal non trovato' }, { status: 404 });

  if (body.action === 'pause') {
    const updated = await transitionCommercialGoal(
      admin,
      workspace.id,
      goal.id,
      'PAUSED',
      'HUMAN',
      'dashboard',
    );
    return NextResponse.json({ goal: updated });
  }
  if (body.action === 'resume') {
    const updated = await transitionCommercialGoal(
      admin,
      workspace.id,
      goal.id,
      'ACTIVE',
      'HUMAN',
      'dashboard',
    );
    await enqueueDueCommercialGoalTicks(admin, workspace.id);
    return NextResponse.json({ goal: updated });
  }
  if (['ASK', 'DO', 'AUTOPILOT'].includes(body.mode ?? '')) {
    const { data, error } = await admin
      .from('commercial_goals')
      .update({ mode: body.mode as 'ASK' | 'DO' | 'AUTOPILOT', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', goal.id)
      .select('*')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Aggiornamento fallito' }, { status: 400 });
    }
    return NextResponse.json({ goal: data });
  }
  if (body.action === 'tick') {
    await admin
      .from('commercial_goals')
      .update({ next_tick_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', goal.id);
    const queued = await enqueueDueCommercialGoalTicks(admin, workspace.id);
    return NextResponse.json({ queued });
  }
  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
});
