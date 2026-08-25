import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from '../../src/lib/ai/costs';
import { AiPhaseNotImplementedError } from '../../src/lib/ai/errors';
import { getAiCommercialConfig, readAiProviderMode } from '../../src/lib/ai/config';
import { MockAICommercialProvider } from '../../src/lib/ai/mock';
import {
  extractOutputText,
  extractUsage,
  OpenAICommercialProvider,
} from '../../src/lib/ai/openai';
import type { PersistAiRun } from '../../src/lib/ai/persist';
import { consumeAiTestRateLimit, resetAiTestRateLimit } from '../../src/lib/ai/rate-limit';
import { assertNoSecrets, getPublicAiReadiness } from '../../src/lib/ai/readiness';
import { resolveModel } from '../../src/lib/ai/router';
import { getAICommercialProvider, runClassifyIntent } from '../../src/lib/ai/run';
import { parseStructuredOutput, redactSecrets } from '../../src/lib/ai/structured';
import {
  intentClassificationSchema,
  type AICommercialProvider,
  type AiRunPublic,
  type IntentClassification,
} from '../../src/lib/ai/types';
import { envelopeFromPath } from '../../src/lib/ai/operator/envelope';
import { emptyEntityRefs } from '../../src/lib/ai/operator/context';
import { getAIProvider } from '../../src/lib/providers/ai';
import { getProvidersStatus } from '../../src/lib/providers/status';

const SAMPLE_OUTPUT: IntentClassification = {
  intent: 'website_request',
  language: 'it',
  sentiment: 'neutral',
  buyerOrSeller: 'buyer',
  confidence: 0.91,
  summary: 'Richiesta sito per ristorante',
  reasons: ['Menziona un sito web'],
};

function memoryPersist(): { persist: PersistAiRun; rows: AiRunPublic[] } {
  const rows: AiRunPublic[] = [];
  const persist: PersistAiRun = async (input) => {
    const row: AiRunPublic = {
      id: `run-${rows.length + 1}`,
      model: input.model,
      taskType: input.taskType,
      provider: input.provider,
      inputTokens: input.usage.inputTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      outputTokens: input.usage.outputTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      latencyMs: input.latencyMs,
      status: input.status,
      createdAt: new Date().toISOString(),
    };
    rows.push(row);
    return row;
  };
  return { persist, rows };
}

function env(partial: Record<string, string>): NodeJS.ProcessEnv {
  return partial as unknown as NodeJS.ProcessEnv;
}

function openaiEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return env({
    AI_PROVIDER_MODE: 'openai',
    OPENAI_API_KEY: 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaa',
    AI_MODEL_LUNA: 'gpt-4.1-mini',
    AI_MODEL_TERRA: 'gpt-4.1',
    AI_MODEL_SOL: 'gpt-4.1',
    AI_REQUEST_TIMEOUT_MS: '80',
    ...overrides,
  });
}

function openaiPayload(text: unknown = SAMPLE_OUTPUT) {
  return {
    id: 'resp_test_1',
    output_text: typeof text === 'string' ? text : JSON.stringify(text),
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 10 },
    },
  };
}

describe('AI-0 config and secrets', () => {
  it('accetta mock e openai (live come alias openai)', () => {
    expect(readAiProviderMode(env({ AI_PROVIDER_MODE: 'mock' })).mode).toBe('mock');
    expect(readAiProviderMode(env({ AI_PROVIDER_MODE: 'openai' })).mode).toBe('openai');
    expect(readAiProviderMode(env({ AI_PROVIDER_MODE: 'live' })).mode).toBe('openai');
    expect(readAiProviderMode(env({ AI_PROVIDER_MODE: 'kimi' })).valid).toBe(false);
  });

  it('non espone la chiave API al client', () => {
    const readiness = getPublicAiReadiness(openaiEnv());
    expect(readiness.apiKeyConfigured).toBe(true);
    expect(readiness.ready).toBe(true);
    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toMatch(/sk-test/);
    expect(serialized).not.toMatch(/aaaaaaaa/);
  });

  it('blocca payload con segreto', () => {
    expect(() =>
      assertNoSecrets({ token: 'sk-secret-abcdefghijk' }),
    ).toThrow(/segreto/);
  });

  it('redige chiavi in testo libero', () => {
    expect(redactSecrets('Authorization: Bearer sk-abc123456789')).toContain('[REDACTED]');
  });
});

describe('model router', () => {
  it('usa Luna per classify_intent', () => {
    const decision = resolveModel('classify_intent', openaiEnv());
    expect(decision.tier).toBe('luna');
    expect(decision.model).toBe('gpt-4.1-mini');
  });

  it('usa Terra se il router è spento', () => {
    const decision = resolveModel(
      'classify_intent',
      openaiEnv({ AI_MODEL_ROUTER_ENABLED: 'false' }),
    );
    expect(decision.tier).toBe('terra');
    expect(decision.model).toBe('gpt-4.1');
  });

  it('non scala a Sol solo perché il testo è lungo', () => {
    const decision = resolveModel('classify_intent', openaiEnv());
    expect(decision.tier).not.toBe('sol');
  });

  it('scala a Sol solo per escalation esplicita o confidence bassa', () => {
    expect(resolveModel('draft_outbound', openaiEnv(), { escalateToSol: true }).tier).toBe(
      'sol',
    );
    expect(
      resolveModel('analyze_business', openaiEnv(), { terraConfidence: 0.1 }).tier,
    ).toBe('sol');
  });
});

describe('structured output helper', () => {
  it('accetta JSON valido e fence markdown', () => {
    const parsed = parseStructuredOutput(
      '```json\n' + JSON.stringify(SAMPLE_OUTPUT) + '\n```',
      intentClassificationSchema,
    );
    expect(parsed.intent).toBe('website_request');
  });

  it('rifiuta JSON malformato', () => {
    expect(() => parseStructuredOutput('{nope', intentClassificationSchema)).toThrow(
      /non è JSON/,
    );
  });

  it('rifiuta JSON che non rispetta lo schema', () => {
    expect(() =>
      parseStructuredOutput(JSON.stringify({ intent: 'nope' }), intentClassificationSchema),
    ).toThrow(/schema/);
  });
});

describe('mock commercial provider', () => {
  it('classifica in modo deterministico senza rete', async () => {
    const { persist, rows } = memoryPersist();
    const fetchImpl = (async () => {
      throw new Error('fetch non deve essere chiamato in mock');
    }) as typeof fetch;

    const result = await runClassifyIntent(
      { text: 'Cerco qualcuno per realizzare un sito web a Milano' },
      {
        env: env({ AI_PROVIDER_MODE: 'mock' }),
        workspaceId: 'ws-1',
        persist,
        fetchImpl,
        source: 'unit',
      },
    );

    expect(result.providerMode).toBe('mock');
    expect(result.output?.intent).toBe('website_request');
    expect(result.persisted).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('ok');
    expect(rows[0]?.model).toBe(getAiCommercialConfig(env({ AI_PROVIDER_MODE: 'mock' })).models.luna);
    expect(rows[0]?.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });

  it('implementa answerOperator e lascia summarizeThread non implementato', async () => {
    const provider: AICommercialProvider = new MockAICommercialProvider();
    const planned = await provider.answerOperator(
      {
        question: 'dimmi tutto ciò che puoi fare',
        history: [],
        refs: emptyEntityRefs(),
        envelope: envelopeFromPath('/overview'),
        assistMode: 'ASSISTITO',
        allowedTools: [],
        capabilities: [],
      },
      { model: 'x' },
    );
    expect(planned.output.safetyClass).toBe('HELP');
    await expect(provider.summarizeThread({}, { model: 'x' })).rejects.toBeInstanceOf(
      AiPhaseNotImplementedError,
    );
  });
});

describe('OpenAI commercial provider', () => {
  it('parsa structured output e usage dalla Responses API', async () => {
    const { persist, rows } = memoryPersist();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(openaiPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await runClassifyIntent(
      { text: 'Vorrei un sito vetrina' },
      {
        env: openaiEnv(),
        workspaceId: 'ws-1',
        persist,
        fetchImpl,
        source: 'unit',
      },
    );

    expect(result.providerMode).toBe('openai');
    expect(result.output?.intent).toBe('website_request');
    expect(rows[0]?.status).toBe('ok');
    expect(rows[0]?.inputTokens).toBe(120);
    expect(rows[0]?.cachedInputTokens).toBe(10);
    expect(rows[0]?.outputTokens).toBe(40);
    expect(rows[0]?.estimatedCostUsd).toBe(
      estimateCostUsd(
        { inputTokens: 120, cachedInputTokens: 10, outputTokens: 40 },
        'luna',
        openaiEnv(),
      ),
    );
  });

  it('persiste invalid_output su JSON malformato', async () => {
    const { persist, rows } = memoryPersist();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(openaiPayload('{not-json')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await runClassifyIntent(
      { text: 'test' },
      { env: openaiEnv(), workspaceId: 'ws-1', persist, fetchImpl },
    );

    expect(result.output).toBeNull();
    expect(rows[0]?.status).toBe('invalid_output');
  });

  it('persiste timeout se la chiamata supera il limite', async () => {
    const { persist, rows } = memoryPersist();
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        const abort = () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });

    const result = await runClassifyIntent(
      { text: 'test timeout' },
      {
        env: openaiEnv({ AI_REQUEST_TIMEOUT_MS: '40' }),
        workspaceId: 'ws-1',
        persist,
        fetchImpl,
      },
    );

    expect(result.output).toBeNull();
    expect(rows[0]?.status).toBe('timeout');
  });

  it('estrae testo da output[] della Responses API', () => {
    const text = extractOutputText({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(SAMPLE_OUTPUT) }],
        },
      ],
    });
    expect(JSON.parse(text).intent).toBe('website_request');
    expect(extractUsage(openaiPayload()).cachedInputTokens).toBe(10);
  });

  it('non costruisce il provider openai senza chiave', () => {
    expect(() =>
      getAICommercialProvider(env({ AI_PROVIDER_MODE: 'openai' })),
    ).toThrow(/OPENAI_API_KEY/);
  });
});

describe('copy AIProvider non è l’agente commerciale', () => {
  it('in mock genera ancora il testo template senza rete', async () => {
    const provider = getAIProvider(env({ AI_PROVIDER_MODE: 'mock' }));
    const msg = await provider.generateMessage({
      businessName: 'Trattoria Test',
      category: 'restaurant',
      city: 'Milano',
      highlights: [],
      demoUrl: null,
      senderName: 'Attila',
    });
    expect(msg.generatedBy).toBe('ai-mock');
    expect(msg.subject).toContain('Trattoria Test');
  });
});

describe('providers status AI', () => {
  it('mostra mock senza segreti', async () => {
    const status = await getProvidersStatus(
      env({
        AI_PROVIDER_MODE: 'mock',
        OPENAI_API_KEY: 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );
    const ai = status.providers.find((p) => p.id === 'ai');
    expect(ai?.status).toBe('mock');
    expect(JSON.stringify(status)).not.toMatch(/sk-test/);
  });

  it('mostra ready in openai con chiave presente', async () => {
    const status = await getProvidersStatus(openaiEnv());
    const ai = status.providers.find((p) => p.id === 'ai');
    expect(ai?.status).toBe('ready');
    expect(JSON.stringify(status)).not.toMatch(/sk-test/);
  });
});

describe('rate limit prove AI', () => {
  it('blocca dopo 10 richieste nella finestra', () => {
    resetAiTestRateLimit();
    for (let i = 0; i < 10; i += 1) {
      expect(consumeAiTestRateLimit(1_000)).toBe(true);
    }
    expect(consumeAiTestRateLimit(1_000)).toBe(false);
  });
});

describe('OpenAICommercialProvider diretto', () => {
  it('rifiuta schema incompleto come StructuredOutputError', async () => {
    const provider = new OpenAICommercialProvider({
      apiKey: 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaa',
      timeoutMs: 200,
      fetchImpl: async () =>
        new Response(JSON.stringify(openaiPayload({ intent: 'website_request' })), {
          status: 200,
        }),
    });
    await expect(
      provider.classifyIntent({ text: 'sito' }, { model: 'gpt-4.1-mini' }),
    ).rejects.toThrow(/schema/);
  });
});
