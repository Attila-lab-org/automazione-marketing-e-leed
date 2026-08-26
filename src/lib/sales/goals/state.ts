import type { CommercialGoalStatus } from '@/lib/types/database';
import type { GoalProgressSnapshot } from './types';

const TRANSITIONS: Record<CommercialGoalStatus, CommercialGoalStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  BLOCKED: ['ACTIVE', 'PAUSED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionGoal(
  from: CommercialGoalStatus,
  to: CommercialGoalStatus,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertGoalTransition(
  from: CommercialGoalStatus,
  to: CommercialGoalStatus,
): void {
  if (!canTransitionGoal(from, to)) {
    throw new Error(`Transizione goal non valida: ${from} → ${to}`);
  }
}

export function resolveGoalStatus(
  current: CommercialGoalStatus,
  progress: GoalProgressSnapshot,
  now = new Date(),
  deadline?: string,
): CommercialGoalStatus {
  if (current === 'PAUSED' || current === 'CANCELLED' || current === 'COMPLETED') return current;
  if (progress.actual >= progress.target) return 'COMPLETED';
  if (deadline && new Date(deadline).getTime() <= now.getTime()) return 'BLOCKED';
  if (progress.blockers.includes('NO_EXECUTABLE_STRATEGY')) return 'BLOCKED';
  return 'ACTIVE';
}
