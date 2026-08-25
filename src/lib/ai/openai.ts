import { AiPhaseNotImplementedError, AiTimeoutError, StructuredOutputError } from './errors';
import { parseStructuredOutput, previewText, redactSecrets } from './structured';
import {
  INTENT_JSON_SCHEMA,
  intentClassificationSchema,
  type AICommercialCallContext,
  type AICommercialProvider,
  type AICommercialResult,
  type ClassifyIntentInput,
  type IntentClassification,
  type TokenUsage,
} from './types';

export type OpenAICommercialConfig = {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function notReady(method: string, phase: string): Promise<never> {
  return Promise.reject(new AiPhaseNotImplementedError(method, phase));
}

export function extractOutputText(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) {
    throw new StructuredOutputError('Risposta OpenAI non è un oggetto');
  }
  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text;
  }

  const parts: string[] = [];
  const output = root.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const rec = asRecord(item);
      const content = rec?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const blockRec = asRecord(block);
        if (typeof blockRec?.text === 'string') parts.push(blockRec.text);
      }
    }
  }

  if (parts.length > 0) return parts.join('\n');
  throw new StructuredOutputError('Risposta OpenAI senza testo strutturato');
}

export function extractUsage(payload: unknown): TokenUsage {
  const usage = asRecord(asRecord(payload)?.usage);
  const details = asRecord(usage?.input_tokens_details);
  const cached =
    typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0;
  return {
    inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
    cachedInputTokens: cached,
    outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
  };
}

export function extractRequestId(payload: unknown): string | null {
  const id = asRecord(payload)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const CLASSIFY_SYSTEM = [
  'Sei un classificatore commerciale. Rispondi solo con JSON aderente allo schema.',
  'Non inventare fatti. Non includere segreti. Non proporre invii o sconti.',
].join(' ');

export class OpenAICommercialProvider implements AICommercialProvider {
  private readonly config: OpenAICommercialConfig;

  constructor(config: OpenAICommercialConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenAICommercialProvider: manca OPENAI_API_KEY — usa AI_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
  }

  async classifyIntent(
    input: ClassifyIntentInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<IntentClassification>> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const base = (this.config.apiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const user = [
      input.languageHint ? `Lingua attesa: ${input.languageHint}` : 'Lingua attesa: it',
      'Classifica il messaggio seguente:',
      input.text.trim(),
    ].join('\n');

    const response = await fetchWithTimeout(
      fetchImpl,
      `${base}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ctx.model,
          input: [
            { role: 'system', content: CLASSIFY_SYSTEM },
            { role: 'user', content: user },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'intent_classification',
              strict: true,
              schema: INTENT_JSON_SCHEMA,
            },
          },
        }),
      },
      this.config.timeoutMs,
    );

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(
        `OpenAI HTTP ${response.status}: ${previewText(redactSecrets(rawBody), 180)}`,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new StructuredOutputError('Risposta OpenAI non è JSON', previewText(rawBody));
    }

    const output = parseStructuredOutput(extractOutputText(payload), intentClassificationSchema);
    return {
      output,
      model: ctx.model,
      usage: extractUsage(payload),
      requestId: extractRequestId(payload),
    };
  }

  analyzeBusiness(): Promise<never> {
    return notReady('analyzeBusiness', 'AI-2');
  }
  analyzeWebsite(): Promise<never> {
    return notReady('analyzeWebsite', 'AI-2');
  }
  personalizeDemo(): Promise<never> {
    return notReady('personalizeDemo', 'AI-2');
  }
  draftOutbound(): Promise<never> {
    return notReady('draftOutbound', 'AI-2');
  }
  critiqueOutbound(): Promise<never> {
    return notReady('critiqueOutbound', 'AI-2');
  }
  classifyInbound(): Promise<never> {
    return notReady('classifyInbound', 'AI-4');
  }
  draftReply(): Promise<never> {
    return notReady('draftReply', 'AI-4');
  }
  summarizeThread(): Promise<never> {
    return notReady('summarizeThread', 'AI-1');
  }
  answerOperator(): Promise<never> {
    return notReady('answerOperator', 'AI-1');
  }
}
