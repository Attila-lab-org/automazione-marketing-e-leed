import { AiPhaseNotImplementedError } from './errors';
import { estimateTokensFromText } from './costs';
import type {
  AICommercialCallContext,
  AICommercialProvider,
  AICommercialResult,
  ClassifyIntentInput,
  CommercialIntent,
  IntentClassification,
} from './types';

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
