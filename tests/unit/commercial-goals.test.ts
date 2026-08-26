import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCommercialGoal } from '../../src/lib/sales/goals/command';
import {
  assertGoalTransition,
  canTransitionGoal,
  resolveGoalStatus,
} from '../../src/lib/sales/goals/state';
import { shouldReplanGoal } from '../../src/lib/sales/goals/planner';
import { resolveGoalScopedExecution } from '../../src/lib/ai/operator/tool-contracts';
import { InMemoryJobQueue } from '../../src/lib/jobs/queue';
import type { CommercialGoalPlanRow } from '../../src/lib/types/database';
import type { GoalProgressSnapshot } from '../../src/lib/sales/goals/types';

const observation: GoalProgressSnapshot = {
  metric: 'DEALS_WON',
  target: 10,
  actual: 2,
  remaining: 8,
  progressPct: 20,
  elapsedPct: 50,
  pace: 'BEHIND',
  funnel: {
    leadsFound: 100,
    qualifiedLeads: 20,
    analyzedLeads: 10,
    activeCampaigns: 1,
    outboundMessages: 10,
    positiveReplies: 2,
    appointmentsBooked: 1,
    dealsWon: 2,
  },
  blockers: [],
  observedAt: '2026-08-26T08:00:00.000Z',
};

describe('Commercial Goal outcome parsing', () => {
  it('understands a natural customer outcome without workflow commands', () => {
    const parsed = parseCommercialGoal(
      'Questo mese voglio prendere 10 clienti per siti web a Milano, fai tu',
      new Date('2026-08-10T08:00:00.000Z'),
    );
    expect(parsed).toMatchObject({
      target: 10,
      metric: 'DEALS_WON',
      offer: 'siti web',
      city: 'Milano',
      mode: 'AUTOPILOT',
    });
    const deadline = new Date(parsed!.deadline);
    expect(deadline.getMonth()).toBe(7);
    expect(deadline.getDate()).toBe(31);
  });

  it('does not reinterpret an ordinary command as a persistent goal', () => {
    expect(parseCommercialGoal('prepara 10 demo per Milano')).toBeNull();
  });
});

describe('Commercial Goal state machine and verification', () => {
  it('allows pause/resume but never reopens a completed goal', () => {
    expect(canTransitionGoal('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionGoal('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransitionGoal('COMPLETED', 'ACTIVE')).toBe(false);
    expect(() => assertGoalTransition('COMPLETED', 'ACTIVE')).toThrow(/non valida/);
  });

  it('completes only from measured progress evidence', () => {
    expect(resolveGoalStatus('ACTIVE', { ...observation, actual: 10 })).toBe('COMPLETED');
    expect(resolveGoalStatus('ACTIVE', observation)).toBe('ACTIVE');
  });

  it('replans for pace drift and not for an identical observation', () => {
    const plan = {
      id: 'plan-1',
      workspace_id: 'workspace-1',
      goal_id: 'goal-1',
      version: 1,
      status: 'ACTIVE',
      rationale: 'test',
      hypotheses: [],
      actions: [],
      success_criteria: [],
      observation_hash: 'same',
      replan_reason: null,
      created_at: observation.observedAt,
      completed_at: null,
    } satisfies CommercialGoalPlanRow;
    expect(shouldReplanGoal(plan, 'same', observation).replan).toBe(false);
    expect(shouldReplanGoal(plan, 'changed', observation)).toEqual({
      replan: true,
      reason: 'PACE_BEHIND',
    });
  });
});

describe('Goal-scoped AUTOPILOT policy', () => {
  it('keeps external work in shadow mode during rollout', () => {
    expect(
      resolveGoalScopedExecution({
        mode: 'AUTOPILOT',
        tier: 'CONFIRM_EXTERNAL',
        autonomyActive: true,
        sendGuardReady: true,
        withinDailyLimit: true,
        shadowMode: true,
        escalation: false,
      }),
    ).toEqual({ decision: 'SHADOW', reason: 'SHADOW_MODE' });
  });

  it('allows external work only when every policy gate is green', () => {
    expect(
      resolveGoalScopedExecution({
        mode: 'AUTOPILOT',
        tier: 'CONFIRM_EXTERNAL',
        autonomyActive: true,
        sendGuardReady: true,
        withinDailyLimit: true,
        shadowMode: false,
        escalation: false,
      }).decision,
    ).toBe('ALLOW');
  });

  it('never executes an external action twice for the same idempotency key', async () => {
    const queue = new InMemoryJobQueue();
    const input = {
      workspaceId: 'workspace-1',
      jobType: 'COMMERCIAL_GOAL_TICK' as const,
      entityType: 'commercial_goal',
      entityId: 'goal-1',
      idempotencyKey: 'COMMERCIAL_GOAL_TICK:goal-1:42',
    };
    const first = await queue.enqueue(input);
    const second = await queue.enqueue(input);
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.job.id).toBe(first.job.id);
  });
});

describe('Commercial Goal migration contract', () => {
  it('contains persistent plans, immutable events, links and the tick job', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/0027_commercial_goal_core.sql'),
      'utf8',
    );
    expect(sql).toMatch(/create table if not exists public\.commercial_goals/i);
    expect(sql).toMatch(/commercial_goal_plans/i);
    expect(sql).toMatch(/commercial_goal_events_append_only/i);
    expect(sql).toMatch(/commercial_goal_links/i);
    expect(sql).toMatch(/COMMERCIAL_GOAL_TICK/i);
  });
});
