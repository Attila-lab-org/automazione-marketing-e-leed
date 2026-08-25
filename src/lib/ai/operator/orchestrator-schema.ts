import { z } from 'zod';
import { OPERATOR_TOOL_NAMES } from './registry';

export const OPERATOR_SAFETY_CLASSES = [
  'READ',
  'PREPARE',
  'EXTERNAL',
  'DESTRUCTIVE',
  'POLICY',
  'HELP',
  'UNKNOWN',
] as const;

export type OperatorSafetyClass = (typeof OPERATOR_SAFETY_CLASSES)[number];

export const operatorHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
});

export type OperatorHistoryItem = z.infer<typeof operatorHistoryItemSchema>;

export const operatorToolCallPlanSchema = z.object({
  name: z.enum(OPERATOR_TOOL_NAMES),
  city: z.string().max(80).nullable(),
  query: z.string().max(120).nullable(),
  category: z.string().max(80).nullable(),
  campaignId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  demoId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  threadId: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(20).nullable(),
});

export type OperatorToolCallPlan = z.infer<typeof operatorToolCallPlanSchema>;

export const OPERATOR_PREPARE_KINDS = [
  'none',
  'campaign',
  'pause',
  'personalize',
  'apply',
  'analyze',
] as const;

export type OperatorPrepareKind = (typeof OPERATOR_PREPARE_KINDS)[number];

export const operatorPlanSchema = z.object({
  safetyClass: z.enum(OPERATOR_SAFETY_CLASSES),
  goal: z.string().min(1).max(400),
  toolCalls: z.array(operatorToolCallPlanSchema).max(8),
  ordinal: z.number().int().min(1).max(20).nullable(),
  clarification: z.string().max(400).nullable(),
  telegramIsInboundScan: z.boolean(),
  prepareKind: z.enum(OPERATOR_PREPARE_KINDS),
});

export type OperatorPlan = z.infer<typeof operatorPlanSchema>;

export const operatorFinalReplySchema = z.object({
  reply: z.string().min(1).max(4000),
  citedTools: z.array(z.string().max(80)).max(12),
});

export type OperatorFinalReply = z.infer<typeof operatorFinalReplySchema>;

function toolCallJson() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', enum: [...OPERATOR_TOOL_NAMES] },
      city: { type: ['string', 'null'] },
      query: { type: ['string', 'null'] },
      category: { type: ['string', 'null'] },
      campaignId: { type: ['string', 'null'] },
      leadId: { type: ['string', 'null'] },
      demoId: { type: ['string', 'null'] },
      templateId: { type: ['string', 'null'] },
      threadId: { type: ['string', 'null'] },
      limit: { type: ['integer', 'null'] },
    },
    required: [
      'name',
      'city',
      'query',
      'category',
      'campaignId',
      'leadId',
      'demoId',
      'templateId',
      'threadId',
      'limit',
    ],
  };
}

export const OPERATOR_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    safetyClass: { type: 'string', enum: [...OPERATOR_SAFETY_CLASSES] },
    goal: { type: 'string' },
    toolCalls: { type: 'array', items: toolCallJson() },
    ordinal: { type: ['integer', 'null'] },
    clarification: { type: ['string', 'null'] },
    telegramIsInboundScan: { type: 'boolean' },
    prepareKind: { type: 'string', enum: [...OPERATOR_PREPARE_KINDS] },
  },
  required: [
    'safetyClass',
    'goal',
    'toolCalls',
    'ordinal',
    'clarification',
    'telegramIsInboundScan',
    'prepareKind',
  ],
} as const;

export const OPERATOR_FINAL_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    citedTools: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'citedTools'],
} as const;

export const OPERATOR_ORCHESTRATOR_PROMPT_VERSION = 'operator-orchestrator-v1';
