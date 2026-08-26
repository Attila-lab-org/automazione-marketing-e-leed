import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type {
  CommercialGoalEventRow,
  CommercialGoalPlanRow,
  CommercialGoalRow,
  CommercialGoalStatus,
  Json,
} from '@/lib/types/database';
import { assertGoalTransition } from './state';
import type {
  CreateCommercialGoalInput,
  GoalProgressSnapshot,
  GoalStrategyPlan,
} from './types';

export async function getActiveCommercialGoal(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<CommercialGoalRow | null> {
  const { data, error } = await admin
    .from('commercial_goals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (error) throw new Error(`Goal attivo: ${error.message}`);
  return data;
}

export async function getLatestCommercialGoal(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<CommercialGoalRow | null> {
  const active = await getActiveCommercialGoal(admin, workspaceId);
  if (active) return active;
  const { data, error } = await admin
    .from('commercial_goals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Ultimo goal: ${error.message}`);
  return data;
}

export async function getCommercialGoal(
  admin: AppSupabaseClient,
  workspaceId: string,
  goalId: string,
): Promise<CommercialGoalRow | null> {
  const { data, error } = await admin
    .from('commercial_goals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', goalId)
    .maybeSingle();
  if (error) throw new Error(`Goal: ${error.message}`);
  return data;
}

export async function createCommercialGoal(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: CreateCommercialGoalInput,
): Promise<CommercialGoalRow> {
  const deadline = new Date(input.deadline);
  if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
    throw new Error('La scadenza del goal deve essere futura');
  }
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0) {
    throw new Error('Il target del goal deve essere maggiore di zero');
  }
  await admin
    .from('commercial_goals')
    .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE');

  const nextTickAt = new Date(Date.now() + 60_000).toISOString();
  const { data, error } = await admin
    .from('commercial_goals')
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      outcome_type: input.outcomeType ?? 'ACQUIRE_CUSTOMERS',
      offer_key: input.offerKey,
      target_metric: input.targetMetric,
      target_value: input.targetValue,
      deadline: deadline.toISOString(),
      market: (input.market ?? {}) as Json,
      mode: input.mode ?? 'DO',
      constraints: (input.constraints ?? { shadowMode: true }) as Json,
      next_tick_at: nextTickAt,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Creazione goal: ${error?.message ?? 'fallita'}`);
  await appendGoalEvent(admin, {
    workspaceId,
    goalId: data.id,
    actor: 'HUMAN',
    eventType: 'GOAL_CREATED',
    payload: { title: data.title, target: data.target_value, metric: data.target_metric },
  });
  return data;
}

export async function transitionCommercialGoal(
  admin: AppSupabaseClient,
  workspaceId: string,
  goalId: string,
  status: CommercialGoalStatus,
  actor: 'AI' | 'HUMAN' | 'SYSTEM',
  reason: string,
): Promise<CommercialGoalRow> {
  const current = await getCommercialGoal(admin, workspaceId, goalId);
  if (!current) throw new Error('Goal non trovato');
  assertGoalTransition(current.status, status);
  const { data, error } = await admin
    .from('commercial_goals')
    .update({
      status,
      updated_at: new Date().toISOString(),
      next_tick_at: status === 'ACTIVE' ? new Date(Date.now() + 60_000).toISOString() : null,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', goalId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Aggiornamento goal: ${error?.message ?? 'fallito'}`);
  await appendGoalEvent(admin, {
    workspaceId,
    goalId,
    actor,
    eventType: `GOAL_${status}`,
    payload: { from: current.status, reason },
  });
  return data;
}

export async function saveGoalObservation(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  snapshot: GoalProgressSnapshot,
  status: CommercialGoalStatus,
  nextTickAt: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from('commercial_goals')
    .update({
      current_value: snapshot.actual,
      progress_snapshot: snapshot as unknown as Json,
      status,
      last_observed_at: snapshot.observedAt,
      next_tick_at: nextTickAt,
      lock_version: goal.lock_version + 1,
      updated_at: snapshot.observedAt,
    })
    .eq('id', goal.id)
    .eq('workspace_id', goal.workspace_id)
    .eq('lock_version', goal.lock_version)
    .select('id');
  if (error) throw new Error(`Snapshot goal: ${error.message}`);
  return Boolean(data?.length);
}

export async function getActiveGoalPlan(
  admin: AppSupabaseClient,
  goalId: string,
): Promise<CommercialGoalPlanRow | null> {
  const { data } = await admin
    .from('commercial_goal_plans')
    .select('*')
    .eq('goal_id', goalId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  return data;
}

export async function saveGoalPlan(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  plan: GoalStrategyPlan,
  observationHash: string,
  replanReason?: string | null,
): Promise<CommercialGoalPlanRow> {
  const { data: latest } = await admin
    .from('commercial_goal_plans')
    .select('version')
    .eq('goal_id', goal.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin
    .from('commercial_goal_plans')
    .update({ status: 'SUPERSEDED', completed_at: new Date().toISOString() })
    .eq('goal_id', goal.id)
    .eq('status', 'ACTIVE');
  const { data, error } = await admin
    .from('commercial_goal_plans')
    .insert({
      workspace_id: goal.workspace_id,
      goal_id: goal.id,
      version: (latest?.version ?? 0) + 1,
      rationale: plan.rationale,
      hypotheses: plan.hypotheses as unknown as Json,
      actions: plan.actions as unknown as Json,
      success_criteria: plan.successCriteria as unknown as Json,
      observation_hash: observationHash,
      replan_reason: replanReason ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Piano goal: ${error?.message ?? 'fallito'}`);
  return data;
}

export async function appendGoalEvent(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    goalId: string;
    planId?: string | null;
    actor: CommercialGoalEventRow['actor'];
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from('commercial_goal_events').insert({
    workspace_id: input.workspaceId,
    goal_id: input.goalId,
    plan_id: input.planId ?? null,
    actor: input.actor,
    event_type: input.eventType,
    payload: (input.payload ?? {}) as Json,
  });
  if (error) throw new Error(`Evento goal: ${error.message}`);
}

export async function linkGoalEntity(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    goalId: string;
    entityType: 'campaign' | 'lead' | 'demo' | 'thread' | 'calendar_event' | 'automation_job';
    entityId: string;
    role?: string;
  },
): Promise<void> {
  await admin.from('commercial_goal_links').upsert(
    {
      workspace_id: input.workspaceId,
      goal_id: input.goalId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      role: input.role ?? 'CONTRIBUTOR',
    },
    { onConflict: 'goal_id,entity_type,entity_id' },
  );
}
