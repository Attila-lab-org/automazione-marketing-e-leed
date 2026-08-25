import { AiPhaseNotImplementedError } from './errors';
import { estimateTokensFromText } from './costs';
import {
  mockAnalyzeBusiness,
  mockAnalyzeWebsite,
  mockClassifyInbound,
  mockCritiqueOutbound,
  mockDraftOutbound,
  mockDraftReply,
  mockPersonalizeDemo,
  type BusinessAnalysisInput,
  type OutboundWriterInput,
  type WebsiteAnalysisInput,
} from './commercial/mock-impl';
import { applySafetyPolicy, planOperatorTurnMock } from './operator/semantic-plan';
import { composeOrchestratorReply } from './operator/compose-orchestrator';
import type {
  AICommercialCallContext,
  AICommercialProvider,
  AICommercialResult,
  ClassifyIntentInput,
  CommercialIntent,
  IntentClassification,
} from './types';
import type { OutboundDraft } from './commercial/schemas';

function notReady(method: string, phase: string): Promise<never> {
  return Promise.reject(new AiPhaseNotImplementedError(method, phase));
}

function pickIntent(text: string): { intent: CommercialIntent; reasons: string[] } {
  const t = text.toLowerCase();
  if (/e-?commerce|negozio online|shopify|woocommerce/.test(t)) {
    return {
      intent: 'ecommerce_request',
      reasons: ['Parole chiave e-commerce nel testo'],
    };
  }
  if (/sito|website|landing|vetrina online/.test(t)) {
    return {
      intent: 'website_request',
      reasons: ['Parole chiave sito web nel testo'],
    };
  }
  if (/preventivo|quanto costa|quotazione/.test(t)) {
    return {
      intent: 'quote_request',
      reasons: ['Richiesta di prezzo/preventivo'],
    };
  }
  if (/non mi interessa|basta|stop|unsubscribe/.test(t)) {
    return {
      intent: 'not_interested',
      reasons: ['Segnale di rifiuto esplicito'],
    };
  }
  if (/crypto|casino|viagra/.test(t)) {
    return { intent: 'spam', reasons: ['Pattern tipici di spam'] };
  }
  if (/cerco|vorrei|info|informazioni/.test(t)) {
    return { intent: 'inquiry', reasons: ['Richiesta generica di informazioni'] };
  }
  return { intent: 'other', reasons: ['Nessun pattern commerciale forte'] };
}

export class MockAICommercialProvider implements AICommercialProvider {
  readonly generatedBy = 'ai-commercial-mock';

  async classifyIntent(
    input: ClassifyIntentInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<IntentClassification>> {
    const text = input.text.trim();
    const picked = pickIntent(text);
    const output: IntentClassification = {
      intent: picked.intent,
      language: input.languageHint ?? 'it',
      sentiment: picked.intent === 'not_interested' ? 'negative' : 'neutral',
      buyerOrSeller: picked.intent === 'spam' ? 'unknown' : 'buyer',
      confidence: picked.intent === 'other' ? 0.42 : 0.86,
      summary: text ? text.slice(0, 180) : 'Testo vuoto',
      reasons: picked.reasons,
    };

    return {
      output,
      model: ctx.model,
      requestId: `mock-${this.generatedBy}`,
      usage: {
        inputTokens: estimateTokensFromText(text),
        cachedInputTokens: 0,
        outputTokens: estimateTokensFromText(JSON.stringify(output)),
      },
    };
  }

  async analyzeBusiness(input: BusinessAnalysisInput, ctx: AICommercialCallContext) {
    return this.wrap(mockAnalyzeBusiness(input), ctx);
  }
  async analyzeWebsite(input: WebsiteAnalysisInput, ctx: AICommercialCallContext) {
    return this.wrap(mockAnalyzeWebsite(input), ctx);
  }
  async personalizeDemo(input: BusinessAnalysisInput, ctx: AICommercialCallContext) {
    return this.wrap(mockPersonalizeDemo(input), ctx);
  }
  async draftOutbound(input: OutboundWriterInput, ctx: AICommercialCallContext) {
    return this.wrap(mockDraftOutbound(input), ctx);
  }
  async critiqueOutbound(
    input: { draft: OutboundDraft; facts: string[] },
    ctx: AICommercialCallContext,
  ) {
    return this.wrap(mockCritiqueOutbound(input.draft, input.facts), ctx);
  }
  async classifyInbound(
    input: {
      text: string;
      recentTurns?: import('./commercial/schemas').SalesThreadTurn[];
      memory?: import('./commercial/schemas').SalesThreadMemorySnapshot | null;
    },
    ctx: AICommercialCallContext,
  ) {
    return this.wrap(mockClassifyInbound(input.text), ctx);
  }
  async draftReply(
    input: import('./commercial/schemas').SalesReplyDraftInput,
    ctx: AICommercialCallContext,
  ) {
    return this.wrap(mockDraftReply(input), ctx);
  }
  summarizeThread(): Promise<never> {
    return notReady('summarizeThread', 'AI-1');
  }
  async answerOperator(
    input: import('./operator/orchestrator-input').OperatorAnswerInput,
    ctx: AICommercialCallContext,
  ) {
    const output = applySafetyPolicy(
      planOperatorTurnMock({
        question: input.question,
        history: input.history,
        refs: input.refs,
        envelope: input.envelope,
      }),
      input.question,
    );
    return this.wrap(output, ctx);
  }
  async composeOperatorAnswer(
    input: import('./operator/orchestrator-input').OperatorComposeInput,
    ctx: AICommercialCallContext,
  ) {
    return this.wrap(composeOrchestratorReply(input), ctx);
  }

  private wrap<T>(output: T, ctx: AICommercialCallContext): AICommercialResult<T> {
    return {
      output,
      model: ctx.model,
      requestId: `mock-${this.generatedBy}`,
      usage: {
        inputTokens: estimateTokensFromText(JSON.stringify(output).slice(0, 2000)),
        cachedInputTokens: 0,
        outputTokens: estimateTokensFromText(JSON.stringify(output)),
      },
    };
  }
}
