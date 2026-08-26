import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import {
  getActiveCommercialGoal,
  getActiveGoalPlan,
  transitionCommercialGoal,
} from '@/lib/sales/goals/store';
import { enqueueDueCommercialGoalTicks } from '@/lib/sales/goals/tick';
import { createAdminSupabaseClient } from '@/lib/supabase/client';

export const GET = withAdmin(async () => {
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const goal = await getActiveCommercialGoal(admin, workspace.id);
  const plan = goal ? await getActiveGoalPlan(admin, goal.id) : null;
  return NextResponse.json({ goal, plan });
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
    : { data: await getActiveCommercialGoal(admin, workspace.id) };
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
