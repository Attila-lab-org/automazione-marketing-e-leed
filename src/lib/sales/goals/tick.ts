import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import { goalActionPlanSchema } from '@/lib/ai/commercial/schemas';
import { resolveGoalStatus } from './state';
import {
  appendGoalEvent,
  getActiveGoalPlan,
  getCommercialGoal,
  saveGoalObservation,
  saveGoalPlan,
} from './store';
import { hashGoalObservation, observeCommercialGoal } from './observe';
import { planCommercialGoal, shouldReplanGoal } from './planner';
import { executeGoalPlan } from './executor';
import type { GoalActionPlan, GoalTickResult } from './types';

function parseActions(value: unknown): GoalActionPlan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = goalActionPlanSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function runCommercialGoalTick(input: {
  admin: AppSupabaseClient;
  workspaceId: string;
  goalId: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<GoalTickResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const goal = await getCommercialGoal(input.admin, input.workspaceId, input.goalId);
  if (!goal) throw new Error('COMMERCIAL_GOAL_NOT_FOUND');
  if (goal.status !== 'ACTIVE') {
    return {
      goalId: goal.id,
      status: goal.status,
      observation: goal.progress_snapshot as unknown as GoalTickResult['observation'],
      planId: null,
      executed: [],
      nextTickAt: null,
    };
  }

  const observation = await observeCommercialGoal(input.admin, goal, env, now);
  const observationHash = hashGoalObservation(observation);
  const resolvedStatus = resolveGoalStatus(goal.status, observation, now, goal.deadline);
  const nextTickAt =
    resolvedStatus === 'ACTIVE'
      ? new Date(now.getTime() + (observation.pace === 'BEHIND' ? 15 : 60) * 60_000).toISOString()
      : null;
  const claimed = await saveGoalObservation(
    input.admin,
    goal,
    observation,
    resolvedStatus,
    nextTickAt,
  );
  if (!claimed) throw new Error('COMMERCIAL_GOAL_TICK_CONFLICT');
  await appendGoalEvent(input.admin, {
    workspaceId: goal.workspace_id,
    goalId: goal.id,
    actor: 'SYSTEM',
    eventType: 'GOAL_OBSERVED',
    payload: { observationHash, observation },
  });
  if (resolvedStatus !== 'ACTIVE') {
    await appendGoalEvent(input.admin, {
      workspaceId: goal.workspace_id,
      goalId: goal.id,
      actor: 'SYSTEM',
      eventType: resolvedStatus === 'COMPLETED' ? 'GOAL_COMPLETED' : 'GOAL_BLOCKED',
      payload: { evidence: observation },
    });
    return {
      goalId: goal.id,
      status: resolvedStatus,
      observation,
      planId: null,
      executed: [],
      nextTickAt: null,
    };
  }

  let currentPlan = await getActiveGoalPlan(input.admin, goal.id);
  const replan = shouldReplanGoal(currentPlan, observationHash, observation);
  if (replan.replan) {
    const candidate = await planCommercialGoal(input.admin, goal, observation, currentPlan, env);
    currentPlan = await saveGoalPlan(
      input.admin,
      goal,
      candidate,
      observationHash,
      replan.reason,
    );
    await appendGoalEvent(input.admin, {
      workspaceId: goal.workspace_id,
      goalId: goal.id,
      planId: currentPlan.id,
      actor: 'AI',
      eventType: 'PLAN_CREATED',
      payload: {
        version: currentPlan.version,
        reason: replan.reason,
        rationale: currentPlan.rationale,
      },
    });
  }
  const actions = parseActions(currentPlan?.actions);
  const executed = currentPlan
    ? await executeGoalPlan(input.admin, goal, currentPlan, actions, env)
    : [];
  return {
    goalId: goal.id,
    status: resolvedStatus,
    observation,
    planId: currentPlan?.id ?? null,
    executed,
    nextTickAt,
  };
}

export async function enqueueDueCommercialGoalTicks(
  admin: AppSupabaseClient,
  workspaceId: string,
  now = new Date(),
): Promise<{ enqueued: number; deduplicated: number }> {
  const { data: goals, error } = await admin
    .from('commercial_goals')
    .select('id, next_tick_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE')
    .or(`next_tick_at.is.null,next_tick_at.lte.${now.toISOString()}`)
    .limit(20);
  if (error) throw new Error(`Goal tick scan: ${error.message}`);
  const queue = new SupabaseJobQueue(admin);
  let enqueued = 0;
  let deduplicated = 0;
  const bucket = Math.floor(now.getTime() / (15 * 60_000));
  for (const goal of goals ?? []) {
    const result = await queue.enqueue({
      workspaceId,
      jobType: 'COMMERCIAL_GOAL_TICK',
      entityType: 'commercial_goal',
      entityId: goal.id,
      idempotencyKey: `COMMERCIAL_GOAL_TICK:${goal.id}:${bucket}`,
      inputSnapshot: { goalId: goal.id, dueAt: goal.next_tick_at },
      priority: 20,
      maxAttempts: 3,
    });
    if (result.deduplicated) deduplicated += 1;
    else enqueued += 1;
    await appendGoalEvent(admin, {
      workspaceId,
      goalId: goal.id,
      actor: 'SYSTEM',
      eventType: 'TICK_ENQUEUED',
      payload: { jobId: result.job.id, deduplicated: result.deduplicated },
    });
    await admin
      .from('commercial_goal_links')
      .upsert(
        {
          workspace_id: workspaceId,
          goal_id: goal.id,
          entity_type: 'automation_job',
          entity_id: result.job.id,
          role: 'TICK',
        },
        { onConflict: 'goal_id,entity_type,entity_id' },
      );
  }
  return { enqueued, deduplicated };
}
