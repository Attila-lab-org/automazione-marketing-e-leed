import { getAiCommercialConfig, type AiCommercialConfig } from './config';
import type { AiTaskType, ModelTier } from './types';

const TASK_TIER: Record<AiTaskType, ModelTier> = {
  classify_intent: 'luna',
  classify_inbound: 'luna',
  critique_outbound: 'luna',
  analyze_business: 'terra',
  analyze_website: 'terra',
  personalize_demo: 'terra',
  draft_outbound: 'terra',
  draft_reply: 'terra',
  summarize_thread: 'terra',
  answer_operator: 'terra',
  answer_operator_simple: 'luna',
  plan_commercial_goal: 'terra',
};

export type RouteDecision = {
  tier: ModelTier;
  model: string;
  reason: string;
};

export type RouteOptions = {
  /** Solo escalation esplicita: mai perché il testo è lungo. */
  escalateToSol?: boolean;
  terraConfidence?: number;
};

export function resolveModel(
  taskType: AiTaskType,
  env: NodeJS.ProcessEnv = process.env,
  options: RouteOptions = {},
  config: AiCommercialConfig = getAiCommercialConfig(env),
): RouteDecision {
  if (!config.routerEnabled) {
    return {
      tier: 'terra',
      model: config.models.terra,
      reason: 'router disabilitato — Terra predefinito',
    };
  }

  if (options.escalateToSol) {
    return {
      tier: 'sol',
      model: config.models.sol,
      reason: 'escalation esplicita operatore',
    };
  }

  if (
    typeof options.terraConfidence === 'number' &&
    options.terraConfidence < config.solEscalateBelow
  ) {
    return {
      tier: 'sol',
      model: config.models.sol,
      reason: `confidence Terra ${options.terraConfidence} sotto soglia ${config.solEscalateBelow}`,
    };
  }

  const tier = TASK_TIER[taskType];
  return {
    tier,
    model: config.models[tier],
    reason: `task ${taskType} → ${tier}`,
  };
}
