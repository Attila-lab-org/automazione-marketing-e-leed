import type { ModelTier, TokenUsage } from './types';

/** Stime configurabili — non sono prezzi di fatturazione reali. */
export type ModelRatesUsdPer1M = {
  input: number;
  cachedInput: number;
  output: number;
};

const DEFAULT_RATES: Record<ModelTier, ModelRatesUsdPer1M> = {
  luna: { input: 0.4, cachedInput: 0.1, output: 1.6 },
  terra: { input: 2, cachedInput: 0.5, output: 8 },
  sol: { input: 15, cachedInput: 3.75, output: 60 },
};

function envRate(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function ratesForTier(
  tier: ModelTier,
  env: NodeJS.ProcessEnv = process.env,
): ModelRatesUsdPer1M {
  const prefix = `AI_COST_${tier.toUpperCase()}`;
  return {
    input: envRate(env, `${prefix}_INPUT_USD_PER_1M`, DEFAULT_RATES[tier].input),
    cachedInput: envRate(env, `${prefix}_CACHED_INPUT_USD_PER_1M`, DEFAULT_RATES[tier].cachedInput),
    output: envRate(env, `${prefix}_OUTPUT_USD_PER_1M`, DEFAULT_RATES[tier].output),
  };
}

export function estimateCostUsd(
  usage: TokenUsage,
  tier: ModelTier,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const rates = ratesForTier(tier, env);
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usd =
    (uncachedInput / 1_000_000) * rates.input +
    (usage.cachedInputTokens / 1_000_000) * rates.cachedInput +
    (usage.outputTokens / 1_000_000) * rates.output;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
