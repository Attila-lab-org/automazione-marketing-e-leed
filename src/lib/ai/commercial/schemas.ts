import { z } from 'zod';
import type { NegotiationGuidance } from '@/lib/sales/negotiation';

export const QUALITY_VALUES = ['unknown', 'low', 'medium', 'high'] as const;
export const BOOKING_VALUES = ['unknown', 'none_observed', 'present'] as const;

export const evidenceItemSchema = z.object({
  label: z.string().min(1).max(160),
  source: z.enum(['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured']),
  quote: z.string().min(1).max(400),
});

export const groundedNoteSchema = z.object({
  text: z.string().min(1).max(240),
  evidence: z.string().min(1).max(400),
});

export const websiteAnalysisSchema = z.object({
  opportunityScore: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  visualQuality: z.enum(QUALITY_VALUES),
  mobileClarity: z.enum(QUALITY_VALUES),
  ctaClarity: z.enum(QUALITY_VALUES),
  bookingClarity: z.enum(BOOKING_VALUES),
  trustPresentation: z.enum(QUALITY_VALUES),
  strengths: z.array(groundedNoteSchema).max(8),
  issues: z.array(groundedNoteSchema).max(8),
  recommendedOffer: z.string().min(1).max(80),
  recommendedApproach: z.string().min(1).max(400),
  evidence: z.array(evidenceItemSchema).max(12),
  humanReviewRequired: z.boolean(),
});

export type WebsiteAnalysis = z.infer<typeof websiteAnalysisSchema>;

export const businessOpportunitySchema = z.object({
  deterministicScore: z.number().nullable(),
  aiOpportunityScore: z.number().int().min(0).max(100),
  commercialPriority: z.number().int().min(0).max(100),
  confidence: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string().min(1).max(200)).min(1).max(8),
  recommendedOffer: z.string().min(1).max(80),
  recommendedApproach: z.string().min(1).max(400),
  alreadyContacted: z.boolean(),
  factsUsed: z.array(evidenceItemSchema).max(12),
  humanReviewRequired: z.boolean(),
});

export type BusinessOpportunity = z.infer<typeof businessOpportunitySchema>;

export const claimUsedSchema = z.object({
  claim: z.string().min(1).max(240),
  source: z.enum(['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured']),
  evidence: z.string().min(1).max(400),
});

export const outboundDraftSchema = z.object({
  subject: z.string().min(1).max(140),
  textBody: z.string().min(1).max(4000),
  htmlBody: z.string().min(1).max(12000),
  confidence: z.number().min(0).max(1),
  claimsUsed: z.array(claimUsedSchema).max(12),
  reasoningSummary: z.string().min(1).max(400),
  tone: z.string().min(1).max(40),
  recommendedCTA: z.string().min(1).max(80),
});

export type OutboundDraft = z.infer<typeof outboundDraftSchema>;

export const outboundCritiqueSchema = z.object({
  verdict: z.enum(['PASS', 'REWRITE', 'HUMAN_REVIEW']),
  reasons: z.array(z.string().min(1).max(240)).min(1).max(10),
  ungroundedClaims: z.array(z.string().min(1).max(240)).max(10),
  rewriteHints: z.array(z.string().min(1).max(240)).max(8),
});

export type OutboundCritique = z.infer<typeof outboundCritiqueSchema>;

export const demoPersonalizationSchema = z.object({
  headline: z.string().min(1).max(120),
  subheadline: z.string().min(1).max(200),
  description: z.string().min(1).max(600),
  ctaLabel: z.string().min(1).max(40),
  contentPriorities: z.array(z.string().min(1).max(40)).max(6),
  tone: z.string().min(1).max(40),
  sectionEmphasis: z.array(z.string().min(1).max(40)).max(6),
});

export type DemoPersonalization = z.infer<typeof demoPersonalizationSchema>;

export const inboundClassificationSchema = z.object({
  intent: z.enum([
    'greeting',
    'info_request',
    'quote_request',
    'discount_request',
    'website_request',
    'custom_request',
    'call_accept',
    'follow_up_later',
    'not_interested',
    'unsubscribe',
    'angry',
    'legal_privacy',
    'other',
  ]),
  language: z.string().min(2).max(16),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  recommendedState: z.string().min(1).max(40),
  unsubscribe: z.boolean(),
  notInterested: z.boolean(),
  pricing: z.boolean(),
  discountAsk: z.boolean(),
  legal: z.boolean(),
  angry: z.boolean(),
  followUpLater: z.boolean(),
  followUpAt: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(400),
  servicesRequested: z.array(z.string().min(1).max(80)).max(8),
  bookingRequest: z.boolean(),
  bookingAccepted: z.boolean(),
  preferredTimeHint: z.string().max(200).nullable(),
  cancelAppointment: z.boolean(),
  rescheduleAppointment: z.boolean(),
  bookingConfidence: z.number().min(0).max(1),
});

export type InboundClassification = z.infer<typeof inboundClassificationSchema>;

export const salesReplyDraftSchema = z.object({
  text: z.string().min(1).max(4000),
  claimsUsed: z.array(claimUsedSchema).max(8),
  recommendedState: z.string().min(1).max(40),
  nextStep: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
  humanRequiredReason: z.string().max(200).nullable(),
});

export type SalesReplyDraft = z.infer<typeof salesReplyDraftSchema>;

export type SalesThreadTurn = {
  direction: 'INBOUND' | 'OUTBOUND';
  text: string;
};

export type SalesThreadMemorySnapshot = {
  main_need: string | null;
  services_requested: string[];
  next_step: string | null;
  pricing_discussed: boolean;
  sentiment: string | null;
};

export type AvailableSlotPrompt = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

export type SalesReplyDraftInput = {
  classification: InboundClassification;
  playbookName: string;
  pricingAllowed: boolean;
  priceRange?: string | null;
  negotiation?: NegotiationGuidance | null;
  bookingUrl?: string | null;
  allowedFeatures: string[];
  inboundText?: string;
  recentTurns?: SalesThreadTurn[];
  memory?: SalesThreadMemorySnapshot | null;
  availableSlots?: AvailableSlotPrompt[];
  appointmentLabel?: string | null;
};

export const GOAL_ACTION_VALUES = [
  'RESEARCH_SEGMENT',
  'PREPARE_DEMOS',
  'START_CAMPAIGN',
  'FOLLOW_UP',
  'PAUSE_SEGMENT',
  'REQUEST_HUMAN',
  'WAIT',
] as const;

export const goalActionPlanSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(GOAL_ACTION_VALUES),
  priority: z.number().int().min(1).max(100),
  rationale: z.string().min(1).max(500),
  params: z.record(z.string(), z.unknown()),
  verification: z.string().min(1).max(300),
  safety: z.enum(['INTERNAL', 'EXTERNAL', 'HUMAN']),
});

export const goalStrategyPlanSchema = z.object({
  rationale: z.string().min(1).max(1200),
  hypotheses: z.array(z.string().min(1).max(300)).max(10),
  actions: z.array(goalActionPlanSchema).min(1).max(8),
  successCriteria: z.array(z.string().min(1).max(300)).min(1).max(8),
});

export type GoalStrategyPlanOutput = z.infer<typeof goalStrategyPlanSchema>;

export const PROMPT_VERSIONS = {
  websiteAnalysis: 'website-analysis-v1',
  businessOpportunity: 'business-opportunity-v1',
  outbound: 'outbound-v1',
  critic: 'outbound-critic-v1',
  demo: 'demo-personalization-v1',
  inbound: 'inbound-classify-v2',
  reply: 'sales-reply-v2',
  goalPlanner: 'goal-planner-v1',
} as const;

function objectSchema(
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties, required };
}

export const WEBSITE_ANALYSIS_JSON_SCHEMA = objectSchema(
  {
    opportunityScore: { type: 'integer' },
    confidence: { type: 'number' },
    visualQuality: { type: 'string', enum: [...QUALITY_VALUES] },
    mobileClarity: { type: 'string', enum: [...QUALITY_VALUES] },
    ctaClarity: { type: 'string', enum: [...QUALITY_VALUES] },
    bookingClarity: { type: 'string', enum: [...BOOKING_VALUES] },
    trustPresentation: { type: 'string', enum: [...QUALITY_VALUES] },
    strengths: {
      type: 'array',
      items: objectSchema(
        { text: { type: 'string' }, evidence: { type: 'string' } },
        ['text', 'evidence'],
      ),
    },
    issues: {
      type: 'array',
      items: objectSchema(
        { text: { type: 'string' }, evidence: { type: 'string' } },
        ['text', 'evidence'],
      ),
    },
    recommendedOffer: { type: 'string' },
    recommendedApproach: { type: 'string' },
    evidence: {
      type: 'array',
      items: objectSchema(
        {
          label: { type: 'string' },
          source: {
            type: 'string',
            enum: ['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured'],
          },
          quote: { type: 'string' },
        },
        ['label', 'source', 'quote'],
      ),
    },
    humanReviewRequired: { type: 'boolean' },
  },
  [
    'opportunityScore',
    'confidence',
    'visualQuality',
    'mobileClarity',
    'ctaClarity',
    'bookingClarity',
    'trustPresentation',
    'strengths',
    'issues',
    'recommendedOffer',
    'recommendedApproach',
    'evidence',
    'humanReviewRequired',
  ],
);

const EVIDENCE_ITEM_JSON_SCHEMA = objectSchema(
  {
    label: { type: 'string' },
    source: {
      type: 'string',
      enum: ['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured'],
    },
    quote: { type: 'string' },
  },
  ['label', 'source', 'quote'],
);

export const BUSINESS_OPPORTUNITY_JSON_SCHEMA = objectSchema(
  {
    deterministicScore: { type: ['number', 'null'] },
    aiOpportunityScore: { type: 'integer' },
    commercialPriority: { type: 'integer' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasons: { type: 'array', items: { type: 'string' } },
    recommendedOffer: { type: 'string' },
    recommendedApproach: { type: 'string' },
    alreadyContacted: { type: 'boolean' },
    factsUsed: { type: 'array', items: EVIDENCE_ITEM_JSON_SCHEMA },
    humanReviewRequired: { type: 'boolean' },
  },
  [
    'deterministicScore',
    'aiOpportunityScore',
    'commercialPriority',
    'confidence',
    'reasons',
    'recommendedOffer',
    'recommendedApproach',
    'alreadyContacted',
    'factsUsed',
    'humanReviewRequired',
  ],
);

export const OUTBOUND_DRAFT_JSON_SCHEMA = objectSchema(
  {
    subject: { type: 'string' },
    textBody: { type: 'string' },
    htmlBody: { type: 'string' },
    confidence: { type: 'number' },
    claimsUsed: {
      type: 'array',
      items: objectSchema(
        {
          claim: { type: 'string' },
          source: {
            type: 'string',
            enum: ['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured'],
          },
          evidence: { type: 'string' },
        },
        ['claim', 'source', 'evidence'],
      ),
    },
    reasoningSummary: { type: 'string' },
    tone: { type: 'string' },
    recommendedCTA: { type: 'string' },
  },
  [
    'subject',
    'textBody',
    'htmlBody',
    'confidence',
    'claimsUsed',
    'reasoningSummary',
    'tone',
    'recommendedCTA',
  ],
);

export const OUTBOUND_CRITIQUE_JSON_SCHEMA = objectSchema(
  {
    verdict: { type: 'string', enum: ['PASS', 'REWRITE', 'HUMAN_REVIEW'] },
    reasons: { type: 'array', items: { type: 'string' } },
    ungroundedClaims: { type: 'array', items: { type: 'string' } },
    rewriteHints: { type: 'array', items: { type: 'string' } },
  },
  ['verdict', 'reasons', 'ungroundedClaims', 'rewriteHints'],
);

export const DEMO_PERSONALIZATION_JSON_SCHEMA = objectSchema(
  {
    headline: { type: 'string' },
    subheadline: { type: 'string' },
    description: { type: 'string' },
    ctaLabel: { type: 'string' },
    contentPriorities: { type: 'array', items: { type: 'string' } },
    tone: { type: 'string' },
    sectionEmphasis: { type: 'array', items: { type: 'string' } },
  },
  [
    'headline',
    'subheadline',
    'description',
    'ctaLabel',
    'contentPriorities',
    'tone',
    'sectionEmphasis',
  ],
);

export const INBOUND_CLASSIFICATION_JSON_SCHEMA = objectSchema(
  {
    intent: {
      type: 'string',
      enum: [
        'greeting',
        'info_request',
        'quote_request',
        'discount_request',
        'website_request',
        'custom_request',
        'call_accept',
        'follow_up_later',
        'not_interested',
        'unsubscribe',
        'angry',
        'legal_privacy',
        'other',
      ],
    },
    language: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    recommendedState: { type: 'string' },
    unsubscribe: { type: 'boolean' },
    notInterested: { type: 'boolean' },
    pricing: { type: 'boolean' },
    discountAsk: { type: 'boolean' },
    legal: { type: 'boolean' },
    angry: { type: 'boolean' },
    followUpLater: { type: 'boolean' },
    followUpAt: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    servicesRequested: { type: 'array', items: { type: 'string' } },
    bookingRequest: { type: 'boolean' },
    bookingAccepted: { type: 'boolean' },
    preferredTimeHint: { type: ['string', 'null'] },
    cancelAppointment: { type: 'boolean' },
    rescheduleAppointment: { type: 'boolean' },
    bookingConfidence: { type: 'number' },
  },
  [
    'intent',
    'language',
    'sentiment',
    'recommendedState',
    'unsubscribe',
    'notInterested',
    'pricing',
    'discountAsk',
    'legal',
    'angry',
    'followUpLater',
    'followUpAt',
    'confidence',
    'summary',
    'servicesRequested',
    'bookingRequest',
    'bookingAccepted',
    'preferredTimeHint',
    'cancelAppointment',
    'rescheduleAppointment',
    'bookingConfidence',
  ],
);

export const SALES_REPLY_JSON_SCHEMA = objectSchema(
  {
    text: { type: 'string' },
    claimsUsed: {
      type: 'array',
      items: objectSchema(
        {
          claim: { type: 'string' },
          source: {
            type: 'string',
            enum: ['google', 'website', 'lead', 'campaign', 'demo', 'playbook', 'measured'],
          },
          evidence: { type: 'string' },
        },
        ['claim', 'source', 'evidence'],
      ),
    },
    recommendedState: { type: 'string' },
    nextStep: { type: 'string' },
    confidence: { type: 'number' },
    humanRequiredReason: { type: ['string', 'null'] },
  },
  ['text', 'claimsUsed', 'recommendedState', 'nextStep', 'confidence', 'humanRequiredReason'],
);

export const GOAL_STRATEGY_PLAN_JSON_SCHEMA = objectSchema(
  {
    rationale: { type: 'string' },
    hypotheses: { type: 'array', items: { type: 'string' } },
    actions: {
      type: 'array',
      items: objectSchema(
        {
          id: { type: 'string' },
          type: { type: 'string', enum: [...GOAL_ACTION_VALUES] },
          priority: { type: 'integer' },
          rationale: { type: 'string' },
          params: { type: 'object', additionalProperties: true },
          verification: { type: 'string' },
          safety: { type: 'string', enum: ['INTERNAL', 'EXTERNAL', 'HUMAN'] },
        },
        ['id', 'type', 'priority', 'rationale', 'params', 'verification', 'safety'],
      ),
    },
    successCriteria: { type: 'array', items: { type: 'string' } },
  },
  ['rationale', 'hypotheses', 'actions', 'successCriteria'],
);
