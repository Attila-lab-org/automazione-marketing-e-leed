import type {
  CommercialGoalMetric,
  CommercialGoalMode,
  CommercialGoalRow,
  CommercialGoalStatus,
} from '@/lib/types/database';

export type CommercialGoal = CommercialGoalRow;

export type GoalMarket = {
  country?: string | null;
  city?: string | null;
  category?: string | null;
};

export type GoalConstraints = {
  dailySendLimit?: number;
  maxAiCostUsd?: number;
  minLeadScore?: number;
  requireDemo?: boolean;
  shadowMode?: boolean;
};

export type CreateCommercialGoalInput = {
  title: string;
  outcomeType?: CommercialGoalRow['outcome_type'];
  offerKey: string;
  targetMetric: CommercialGoalMetric;
  targetValue: number;
  deadline: string;
  market?: GoalMarket;
  mode?: CommercialGoalMode;
  constraints?: GoalConstraints;
};

export type GoalProgressSnapshot = {
  metric: CommercialGoalMetric;
  target: number;
  actual: number;
  remaining: number;
  progressPct: number;
  elapsedPct: number;
  pace: 'AHEAD' | 'ON_TRACK' | 'BEHIND';
  funnel: {
    leadsFound: number;
    qualifiedLeads: number;
    analyzedLeads: number;
    activeCampaigns: number;
    outboundMessages: number;
    positiveReplies: number;
    appointmentsBooked: number;
    dealsWon: number;
  };
  blockers: string[];
  observedAt: string;
};

export type GoalActionType =
  | 'RESEARCH_SEGMENT'
  | 'PREPARE_DEMOS'
  | 'START_CAMPAIGN'
  | 'FOLLOW_UP'
  | 'PAUSE_SEGMENT'
  | 'REQUEST_HUMAN'
  | 'WAIT';

export type GoalActionPlan = {
  id: string;
  type: GoalActionType;
  priority: number;
  rationale: string;
  params: Record<string, unknown>;
  verification: string;
  safety: 'INTERNAL' | 'EXTERNAL' | 'HUMAN';
};

export type GoalStrategyPlan = {
  rationale: string;
  hypotheses: string[];
  actions: GoalActionPlan[];
  successCriteria: string[];
};

export type GoalTickResult = {
  goalId: string;
  status: CommercialGoalStatus;
  observation: GoalProgressSnapshot;
  planId: string | null;
  executed: Array<{ actionId: string; result: string }>;
  nextTickAt: string | null;
};
