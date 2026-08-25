import { z } from 'zod';

export const operatorActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open_campaign'),
    campaignId: z.string().uuid(),
    label: z.literal('Apri campagna'),
  }),
  z.object({
    type: z.literal('show_leads'),
    leadIds: z.array(z.string().uuid()).max(20).optional(),
    city: z.string().max(80).optional(),
    label: z.literal('Mostra lead'),
  }),
  z.object({
    type: z.literal('open_lead'),
    leadId: z.string().uuid(),
    label: z.literal('Apri attività'),
  }),
  z.object({
    type: z.literal('open_review'),
    label: z.literal('Apri Review'),
  }),
  z.object({
    type: z.literal('open_demo'),
    path: z.string().min(1).max(200),
    label: z.literal('Apri demo'),
  }),
  z.object({
    type: z.literal('open_inbox'),
    threadId: z.string().uuid().optional(),
    label: z.literal('Apri messaggi'),
  }),
  z.object({
    type: z.literal('open_calendar'),
    week: z.string().max(20).optional(),
    focus: z.string().uuid().optional(),
    label: z.literal('Apri calendario'),
  }),
  z.object({
    type: z.literal('open_settings'),
    section: z.literal('playbook'),
    label: z.literal('Apri impostazioni'),
  }),
  z.object({
    type: z.literal('show_blockers'),
    campaignId: z.string().uuid().optional(),
    label: z.literal('Mostra blocker'),
  }),
  z.object({
    type: z.literal('confirm_action'),
    pendingActionId: z.string().uuid(),
    label: z.union([
      z.literal('Conferma invio'),
      z.literal('Abilita policy'),
      z.literal('Metti in pausa'),
      z.literal('Conferma azione'),
      z.literal('Conferma risposta'),
    ]),
  }),
  z.object({
    type: z.literal('cancel_action'),
    pendingActionId: z.string().uuid(),
    label: z.literal('Annulla'),
  }),
  z.object({
    type: z.literal('send_followup'),
    message: z.string().min(1).max(200),
    label: z.literal('Elimina definitivamente'),
  }),
]);

export type OperatorAction = z.infer<typeof operatorActionSchema>;

export const operatorReplySchema = z.object({
  reply: z.string().min(1).max(4000),
  actions: z.array(operatorActionSchema).max(5),
});

export type OperatorReply = z.infer<typeof operatorReplySchema>;

export const OPERATOR_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['open_campaign'] },
              campaignId: { type: 'string' },
              label: { type: 'string', enum: ['Apri campagna'] },
            },
            required: ['type', 'campaignId', 'label'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['show_leads'] },
              leadIds: { type: 'array', items: { type: 'string' } },
              city: { type: 'string' },
              label: { type: 'string', enum: ['Mostra lead'] },
            },
            required: ['type', 'label'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['open_lead'] },
              leadId: { type: 'string' },
              label: { type: 'string', enum: ['Apri attività'] },
            },
            required: ['type', 'leadId', 'label'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['open_review'] },
              label: { type: 'string', enum: ['Apri Review'] },
            },
            required: ['type', 'label'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['open_inbox'] },
              threadId: { type: 'string' },
              label: { type: 'string', enum: ['Apri messaggi'] },
            },
            required: ['type', 'label'],
          },
        ],
      },
    },
  },
  required: ['reply', 'actions'],
} as const;

export function hrefForAction(action: OperatorAction): string {
  switch (action.type) {
    case 'open_campaign':
      return `/campaigns/${action.campaignId}`;
    case 'show_leads': {
      const params = new URLSearchParams();
      if (action.city) params.set('city', action.city);
      const qs = params.toString();
      return qs ? `/leads?${qs}` : '/leads';
    }
    case 'open_lead':
      return `/leads?lead=${action.leadId}`;
    case 'open_review':
      return '/review-queue';
    case 'open_demo':
      return action.path.startsWith('/') ? action.path : `/${action.path}`;
    case 'open_inbox':
      return action.threadId ? `/inbox?thread=${action.threadId}` : '/inbox';
    case 'open_calendar': {
      const params = new URLSearchParams();
      if (action.week) params.set('week', action.week);
      if (action.focus) params.set('focus', action.focus);
      const qs = params.toString();
      return qs ? `/calendar?${qs}` : '/calendar';
    }
    case 'open_settings':
      return '/settings/playbook';
    case 'show_blockers':
      return action.campaignId ? `/campaigns/${action.campaignId}` : '/campaigns';
    case 'confirm_action':
    case 'cancel_action':
    case 'send_followup':
      return '#';
  }
}

export function parseOperatorActions(raw: unknown): OperatorAction[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAction[] = [];
  for (const item of raw) {
    const parsed = operatorActionSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
