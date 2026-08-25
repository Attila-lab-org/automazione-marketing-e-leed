import { getAiCommercialConfig, getOpenAiApiKey, readAiProviderMode } from './config';
import { estimateCostUsd } from './costs';
import { AiTimeoutError, StructuredOutputError } from './errors';
import { MockAICommercialProvider } from './mock';
import { OpenAICommercialProvider } from './openai';
import type { PersistAiRun } from './persist';
import { resolveModel } from './router';
import type {
  AICommercialProvider,
  AiRunPublic,
  AiRunStatus,
  ClassifyIntentInput,
  IntentClassification,
  TokenUsage,
} from './types';

export type CommercialProviderDeps = {
  fetchImpl?: typeof fetch;
};

export function getAICommercialProvider(
  env: NodeJS.ProcessEnv = process.env,
  deps: CommercialProviderDeps = {},
): AICommercialProvider {
  const parsed = readAiProviderMode(env);
  if (!parsed.valid) {
    throw new Error(`AI_PROVIDER_MODE "${parsed.raw}" non valido: atteso mock|openai`);
  }
  if (parsed.mode === 'mock') {
    return new MockAICommercialProvider();
  }

  const apiKey = getOpenAiApiKey(env);
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY mancante — usa AI_PROVIDER_MODE=mock');
  }
  const config = getAiCommercialConfig(env);
  return new OpenAICommercialProvider({
    apiKey,
    timeoutMs: config.timeoutMs,
    fetchImpl: deps.fetchImpl,
  });
}

export const DEFAULT_CLASSIFY_TEST_TEXT =
  'Cerco qualcuno per realizzare un sito web per il mio ristorante a Milano';

export type ClassifyIntentRunResult = {
  output: IntentClassification | null;
  run: AiRunPublic | null;
  persisted: boolean;
  route: { tier: string; model: string; reason: string };
  providerMode: 'mock' | 'openai';
};

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

function statusFromError(err: unknown): { status: AiRunStatus; message: string } {
  if (err instanceof AiTimeoutError) {
    return { status: 'timeout', message: err.message };
  }
  if (err instanceof StructuredOutputError) {
    return { status: 'invalid_output', message: err.message };
  }
  return {
    status: 'error',
    message: err instanceof Error ? err.message : 'errore sconosciuto',
  };
}

export async function runClassifyIntent(
  input: ClassifyIntentInput,
  options: {
    env?: NodeJS.ProcessEnv;
    workspaceId: string;
    persist: PersistAiRun;
    fetchImpl?: typeof fetch;
    source?: string;
  },
): Promise<ClassifyIntentRunResult> {
  const env = options.env ?? process.env;
  const config = getAiCommercialConfig(env);
  const providerMode = config.mode;
  const route = resolveModel('classify_intent', env, {}, config);
  const provider = getAICommercialProvider(env, { fetchImpl: options.fetchImpl });
  const started = Date.now();

  try {
    const result = await provider.classifyIntent(input, { model: route.model });
    const latencyMs = Date.now() - started;
    const estimatedCostUsd = estimateCostUsd(result.usage, route.tier, env);
    const run = await options.persist({
      workspaceId: options.workspaceId,
      provider: providerMode,
      model: result.model,
      taskType: 'classify_intent',
      usage: result.usage,
      estimatedCostUsd,
      latencyMs,
      status: 'ok',
      requestId: result.requestId,
      meta: { source: options.source ?? 'classify_intent', routeReason: route.reason },
    });

    return {
      output: result.output,
      run,
      persisted: Boolean(run),
      route,
      providerMode,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const { status, message } = statusFromError(err);
    const run = await options.persist({
      workspaceId: options.workspaceId,
      provider: providerMode,
      model: route.model,
      taskType: 'classify_intent',
      usage: emptyUsage(),
      estimatedCostUsd: 0,
      latencyMs,
      status,
      errorMessage: message,
      meta: { source: options.source ?? 'classify_intent', routeReason: route.reason },
    });
    return {
      output: null,
      run,
      persisted: Boolean(run),
      route,
      providerMode,
    };
  }
}
