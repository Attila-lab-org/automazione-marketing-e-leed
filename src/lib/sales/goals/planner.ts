import type { CommercialGoalPlanRow, CommercialGoalRow } from '@/lib/types/database';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { goalStrategyPlanSchema } from '@/lib/ai/commercial/schemas';
import type { GoalActionPlan, GoalProgressSnapshot, GoalStrategyPlan } from './types';

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function deterministicPlan(
  goal: CommercialGoalRow,
  observation: GoalProgressSnapshot,
): GoalStrategyPlan {
  const actions: GoalActionPlan[] = [];
  if (observation.blockers.includes('EMAIL_REPLY_PATH_NOT_READY')) {
    actions.push({
      id: 'resolve-email-readiness',
      type: 'REQUEST_HUMAN',
      priority: 100,
      rationale: 'Il canale email non può ricevere risposte in sicurezza.',
      params: { blocker: 'EMAIL_REPLY_PATH_NOT_READY' },
      verification: 'Reply-To e webhook inbound risultano pronti.',
      safety: 'HUMAN',
    });
  } else if (observation.funnel.leadsFound === 0) {
    actions.push({
      id: 'research-market',
      type: 'RESEARCH_SEGMENT',
      priority: 90,
      rationale: 'Non ci sono lead nel mercato del goal.',
      params: { market: goal.market, limit: 50 },
      verification: 'Almeno 20 lead verificabili vengono salvati.',
      safety: 'INTERNAL',
    });
  } else if (observation.funnel.qualifiedLeads === 0) {
    actions.push({
      id: 'research-qualified',
      type: 'RESEARCH_SEGMENT',
      priority: 85,
      rationale: 'I lead presenti non hanno ancora un argomento commerciale sufficiente.',
      params: { market: goal.market, minScore: 60, limit: 30 },
      verification: 'Esistono lead qualificati e non ancora lavorati.',
      safety: 'INTERNAL',
    });
  } else if (observation.funnel.analyzedLeads < observation.funnel.qualifiedLeads) {
    actions.push({
      id: 'prepare-best-demos',
      type: 'PREPARE_DEMOS',
      priority: 80,
      rationale: 'Prima del contatto serve una soluzione preview grounded per i lead migliori.',
      params: {
        limit: Math.min(10, observation.funnel.qualifiedLeads - observation.funnel.analyzedLeads),
      },
      verification: 'Analisi e demo superano i controlli di qualità.',
      safety: 'INTERNAL',
    });
  } else if (observation.funnel.activeCampaigns === 0) {
    actions.push({
      id: 'start-selective-campaign',
      type: 'START_CAMPAIGN',
      priority: 75,
      rationale: 'Ci sono lead qualificati e analizzati, ma nessuna campagna collegata al goal.',
      params: { limit: Math.min(20, observation.funnel.analyzedLeads) },
      verification: 'La campagna è collegata al goal e i risultati vengono misurati.',
      safety: 'EXTERNAL',
    });
  } else if (observation.funnel.positiveReplies > observation.funnel.appointmentsBooked) {
    actions.push({
      id: 'follow-up-engaged',
      type: 'FOLLOW_UP',
      priority: 70,
      rationale: 'Ci sono conversazioni positive che non hanno ancora prodotto un appuntamento.',
      params: { stage: 'ENGAGED', limit: 10 },
      verification: 'Ogni thread ha prossima azione o appuntamento.',
      safety: 'EXTERNAL',
    });
  } else {
    actions.push({
      id: 'wait-for-evidence',
      type: 'WAIT',
      priority: 20,
      rationale: 'Il piano è attivo e non ci sono nuove evidenze che giustifichino un cambio.',
      params: { hours: 6 },
      verification: 'Nuovi eventi o variazione del ritmo commerciale.',
      safety: 'INTERNAL',
    });
  }
  return {
    rationale: `${goal.title}: avanzamento ${observation.progressPct}% e ritmo ${observation.pace}.`,
    hypotheses: [
      'La qualità del prospect e della soluzione preview viene prima del volume.',
      'Ogni azione esterna deve produrre una misura verificabile.',
    ],
    actions,
    successCriteria: [
      `Portare ${goal.target_metric} da ${observation.actual} a ${goal.target_value} entro ${goal.deadline}.`,
      'Nessuna azione esterna fuori policy o duplicata.',
    ],
  };
}

function enforcePlannerPolicy(
  goal: CommercialGoalRow,
  observation: GoalProgressSnapshot,
  candidate: GoalStrategyPlan,
): GoalStrategyPlan {
  const expectedSafety: Partial<Record<GoalActionPlan['type'], GoalActionPlan['safety']>> = {
    START_CAMPAIGN: 'EXTERNAL',
    FOLLOW_UP: 'EXTERNAL',
    REQUEST_HUMAN: 'HUMAN',
  };
  const actions = candidate.actions.map((action) => ({
    ...action,
    safety: expectedSafety[action.type] ?? action.safety,
    priority: Math.max(1, Math.min(100, Math.round(action.priority))),
  }));
  if (observation.blockers.length && !actions.some((action) => action.type === 'REQUEST_HUMAN')) {
    actions.unshift({
      id: 'planner-blocker',
      type: 'REQUEST_HUMAN',
      priority: 100,
      rationale: `Il goal è bloccato: ${observation.blockers.join(', ')}.`,
      params: { blockers: observation.blockers },
      verification: 'I blocker sono risolti e misurati.',
      safety: 'HUMAN',
    });
  }
  if (goal.mode === 'ASK') {
    return {
      ...candidate,
      actions: actions.map((action) =>
        action.safety === 'EXTERNAL'
          ? {
              ...action,
              type: 'WAIT' as const,
              safety: 'INTERNAL' as const,
              rationale: `${action.rationale} Modalità ASK: proposta non eseguita.`,
            }
          : action,
      ),
    };
  }
  return { ...candidate, actions };
}

export function shouldReplanGoal(
  current: CommercialGoalPlanRow | null,
  observationHash: string,
  observation: GoalProgressSnapshot,
): { replan: boolean; reason: string | null } {
  if (!current) return { replan: true, reason: 'FIRST_PLAN' };
  if (current.observation_hash === observationHash) return { replan: false, reason: null };
  if (observation.blockers.length) return { replan: true, reason: 'BLOCKER_CHANGED' };
  if (observation.pace === 'BEHIND') return { replan: true, reason: 'PACE_BEHIND' };
  return { replan: true, reason: 'NEW_EVIDENCE' };
}

export async function planCommercialGoal(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  observation: GoalProgressSnapshot,
  previousPlan: CommercialGoalPlanRow | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GoalStrategyPlan> {
  const fallback = deterministicPlan(goal, observation);
  if ((env.AI_COMMERCIAL_MODE ?? 'mock') !== 'openai') {
    return enforcePlannerPolicy(goal, observation, fallback);
  }
  const provider = getAICommercialProvider(env);
  if (!provider.planGoalStrategy) return enforcePlannerPolicy(goal, observation, fallback);
  try {
    const { data: playbook } = await admin
      .from('commercial_playbooks')
      .select('*')
      .eq('workspace_id', goal.workspace_id)
      .eq('is_current', true)
      .maybeSingle();
    const route = resolveModel('plan_commercial_goal', env);
    const result = await provider.planGoalStrategy(
      {
        goal: goal as unknown as Record<string, unknown>,
        observation: observation as unknown as Record<string, unknown>,
        playbook: playbook ? parseJsonRecord(playbook) : null,
        previousPlan: previousPlan ? parseJsonRecord(previousPlan) : null,
      },
      { model: route.model },
    );
    const parsed = goalStrategyPlanSchema.safeParse(result.output);
    return enforcePlannerPolicy(goal, observation, parsed.success ? parsed.data : fallback);
  } catch {
    return enforcePlannerPolicy(goal, observation, fallback);
  }
}
