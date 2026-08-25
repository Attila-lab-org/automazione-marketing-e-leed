import type { AiProviderMode } from './types';

export type AiCommercialConfig = {
  mode: AiProviderMode;
  modeValid: boolean;
  rawMode: string;
  apiKeyConfigured: boolean;
  routerEnabled: boolean;
  models: {
    luna: string;
    terra: string;
    sol: string;
  };
  budgetsUsd: {
    normalLead: number;
    hotLead: number;
    thread: number;
    operatorRequest: number;
  };
  timeoutMs: number;
  solEscalateBelow: number;
  outboundEnabled: boolean;
  outboundProduction: boolean;
  maxToolCalls: number;
};

function envString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function envNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFlag(env: NodeJS.ProcessEnv, key: string, fallback = true): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

export function readAiProviderMode(env: NodeJS.ProcessEnv = process.env): {
  mode: AiProviderMode;
  valid: boolean;
  raw: string;
} {
  const raw = (env.AI_PROVIDER_MODE ?? 'mock').trim().toLowerCase();
  if (raw === 'mock' || raw === '') {
    return { mode: 'mock', valid: true, raw: raw || 'mock' };
  }
  if (raw === 'openai' || raw === 'live') {
    return { mode: 'openai', valid: true, raw };
  }
  return { mode: 'mock', valid: false, raw };
}

export function getOpenAiApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key =
    env.OPENAI_API_KEY?.trim() ||
    env.AI_API_KEY?.trim() ||
    env.AI_PROVIDER_API_KEY?.trim() ||
    '';
  return key.length > 0 ? key : null;
}

export function getAiCommercialConfig(env: NodeJS.ProcessEnv = process.env): AiCommercialConfig {
  const parsed = readAiProviderMode(env);
  return {
    mode: parsed.mode,
    modeValid: parsed.valid,
    rawMode: parsed.raw,
    apiKeyConfigured: Boolean(getOpenAiApiKey(env)),
    routerEnabled: envFlag(env, 'AI_MODEL_ROUTER_ENABLED', true),
    models: {
      luna: envString(env, 'AI_MODEL_LUNA', 'gpt-4.1-mini'),
      terra: envString(env, 'AI_MODEL_TERRA', 'gpt-4.1'),
      sol: envString(env, 'AI_MODEL_SOL', 'gpt-4.1'),
    },
    budgetsUsd: {
      normalLead: envNumber(env, 'AI_MAX_COST_NORMAL_LEAD_USD', 0.05),
      hotLead: envNumber(env, 'AI_MAX_COST_HOT_LEAD_USD', 0.25),
      thread: envNumber(env, 'AI_MAX_COST_THREAD_USD', 1),
      operatorRequest: envNumber(env, 'AI_MAX_COST_OPERATOR_USD', 0.2),
    },
    timeoutMs: Math.max(1, Math.floor(envNumber(env, 'AI_REQUEST_TIMEOUT_MS', 20_000))),
    solEscalateBelow: envNumber(env, 'AI_SOL_ESCALATE_CONFIDENCE', 0.35),
    outboundEnabled: envFlag(env, 'AI_OUTBOUND_ENABLED', true),
    outboundProduction: envFlag(env, 'AI_OUTBOUND_PRODUCTION', false),
    maxToolCalls: Math.max(1, Math.floor(envNumber(env, 'AI_MAX_TOOL_CALLS_PER_TURN', 8))),
  };
}

export function isAiCommercialReady(config: AiCommercialConfig = getAiCommercialConfig()): boolean {
  if (!config.modeValid) return false;
  if (config.mode === 'mock') return true;
  return config.apiKeyConfigured;
}
