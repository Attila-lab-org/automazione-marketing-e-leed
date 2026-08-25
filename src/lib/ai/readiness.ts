import { getAiCommercialConfig, isAiCommercialReady } from '@/lib/ai/config';

export type PublicAiReadiness = {
  mode: 'mock' | 'openai';
  modeValid: boolean;
  apiKeyConfigured: boolean;
  routerEnabled: boolean;
  models: { luna: string; terra: string; sol: string };
  budgetsUsd: { normalLead: number; hotLead: number; thread: number };
  timeoutMs: number;
  ready: boolean;
  detail: string;
};

export function getPublicAiReadiness(
  env: NodeJS.ProcessEnv = process.env,
): PublicAiReadiness {
  const config = getAiCommercialConfig(env);
  let detail: string;
  if (!config.modeValid) {
    detail = `AI_PROVIDER_MODE non valido: ${config.rawMode}`;
  } else if (config.mode === 'mock') {
    detail = 'Modalità prova: nessuna chiamata OpenAI';
  } else if (!config.apiKeyConfigured) {
    detail = 'Modalità OpenAI senza chiave: configura OPENAI_API_KEY';
  } else {
    detail = 'OpenAI collegato. Non invia messaggi ai clienti.';
  }

  return {
    mode: config.mode,
    modeValid: config.modeValid,
    apiKeyConfigured: config.apiKeyConfigured,
    routerEnabled: config.routerEnabled,
    models: config.models,
    budgetsUsd: config.budgetsUsd,
    timeoutMs: config.timeoutMs,
    ready: isAiCommercialReady(config),
    detail,
  };
}

export function assertNoSecrets(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/sk-[A-Za-z0-9_-]{8,}/.test(text) || /Bearer\s+[A-Za-z0-9._-]{12,}/i.test(text)) {
    throw new Error('Payload AI contiene un segreto: blocco verso il browser');
  }
}
