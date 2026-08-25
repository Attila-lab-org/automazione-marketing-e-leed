/**
 * Contratto AI commerciale (AI-0).
 * Separato da AIProvider (generateMessage) per non alterare l'invio email.
 */

import { z } from 'zod';
import type {
  BusinessOpportunity,
  DemoPersonalization,
  InboundClassification,
  OutboundCritique,
  OutboundDraft,
  SalesReplyDraft,
  WebsiteAnalysis,
} from './commercial/schemas';
import type {
  BusinessAnalysisInput,
  OutboundWriterInput,
  WebsiteAnalysisInput,
} from './commercial/mock-impl';

export type AiProviderMode = 'mock' | 'openai';

export type AiRunStatus = 'ok' | 'error' | 'timeout' | 'invalid_output';

export type AiTaskType =
  | 'classify_intent'
  | 'analyze_business'
  | 'analyze_website'
  | 'personalize_demo'
  | 'draft_outbound'
  | 'critique_outbound'
  | 'classify_inbound'
  | 'draft_reply'
  | 'summarize_thread'
  | 'answer_operator'
  | 'answer_operator_simple';

export type ModelTier = 'luna' | 'terra' | 'sol';

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type AICommercialResult<T> = {
  output: T;
  model: string;
  usage: TokenUsage;
  requestId: string | null;
};

export const INTENT_VALUES = [
  'inquiry',
  'quote_request',
  'website_request',
  'ecommerce_request',
  'not_interested',
  'spam',
  'other',
] as const;

export type CommercialIntent = (typeof INTENT_VALUES)[number];

export const intentClassificationSchema = z.object({
  intent: z.enum(INTENT_VALUES),
  language: z.string().min(2).max(16),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  buyerOrSeller: z.enum(['buyer', 'seller', 'unknown']),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(500),
  reasons: z.array(z.string().min(1).max(200)).min(1).max(8),
});

export type IntentClassification = z.infer<typeof intentClassificationSchema>;

/** JSON Schema strict per OpenAI Responses API. */
export const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: [...INTENT_VALUES] },
    language: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    buyerOrSeller: { type: 'string', enum: ['buyer', 'seller', 'unknown'] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'intent',
    'language',
    'sentiment',
    'buyerOrSeller',
    'confidence',
    'summary',
    'reasons',
  ],
} as const;

export type ClassifyIntentInput = {
  text: string;
  languageHint?: string;
};

export type AICommercialCallContext = {
  model: string;
};

/**
 * Interfaccia completa dell'agente commerciale.
 * AI-0 implementa classifyIntent; gli altri metodi restano esplicitamente
 * non implementati fino alla fase indicata.
 */
export interface AICommercialProvider {
  classifyIntent(
    input: ClassifyIntentInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<IntentClassification>>;
  analyzeBusiness(
    input: BusinessAnalysisInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<BusinessOpportunity>>;
  analyzeWebsite(
    input: WebsiteAnalysisInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<WebsiteAnalysis>>;
  personalizeDemo(
    input: BusinessAnalysisInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<DemoPersonalization>>;
  draftOutbound(
    input: OutboundWriterInput,
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<OutboundDraft>>;
  critiqueOutbound(
    input: { draft: OutboundDraft; facts: string[] },
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<OutboundCritique>>;
  classifyInbound(
    input: { text: string },
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<InboundClassification>>;
  draftReply(
    input: {
      classification: InboundClassification;
      playbookName: string;
      pricingAllowed: boolean;
      priceRange?: string | null;
      bookingUrl?: string | null;
      allowedFeatures: string[];
    },
    ctx: AICommercialCallContext,
  ): Promise<AICommercialResult<SalesReplyDraft>>;
  summarizeThread(input: unknown, ctx: AICommercialCallContext): Promise<never>;
  answerOperator(input: unknown, ctx: AICommercialCallContext): Promise<never>;
}

export type AiRunInsertInput = {
  workspaceId: string;
  provider: AiProviderMode;
  model: string;
  taskType: AiTaskType;
  leadId?: string | null;
  campaignId?: string | null;
  threadId?: string | null;
  usage: TokenUsage;
  estimatedCostUsd: number;
  latencyMs: number;
  status: AiRunStatus;
  errorMessage?: string | null;
  requestId?: string | null;
  meta?: Record<string, unknown>;
};

export type AiRunPublic = {
  id: string;
  model: string;
  taskType: string;
  provider: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: AiRunStatus;
  createdAt: string;
};
