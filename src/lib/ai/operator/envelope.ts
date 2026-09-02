import { z } from 'zod';

export const OPERATOR_ENTITY_TYPES = ['none', 'campaign', 'lead', 'thread', 'review', 'calendar', 'event'] as const;
export type OperatorEntityType = (typeof OPERATOR_ENTITY_TYPES)[number];

export const operatorEnvelopeSchema = z.object({
  route: z.string().max(200).default('/overview'),
  entityType: z.enum(OPERATOR_ENTITY_TYPES).default('none'),
  entityId: z.string().uuid().nullable().optional(),
  filters: z
    .object({
      city: z.string().max(80).optional(),
      query: z.string().max(120).optional(),
    })
    .optional(),
  selectedIds: z.array(z.string().uuid()).max(20).optional(),
});

export type OperatorEnvelope = z.infer<typeof operatorEnvelopeSchema>;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function envelopeFromPath(pathname: string, search = ''): OperatorEnvelope {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const parts = pathname.split('/').filter(Boolean);
  const city = params.get('city')?.trim() || undefined;
  const query = params.get('q')?.trim() || undefined;
  const filters = city || query ? { city, query } : undefined;
  const threadParam = params.get('thread')?.trim() || undefined;

  if (parts[0] === 'campaigns' && parts[1] && UUID_RE.test(parts[1])) {
    return { route: pathname, entityType: 'campaign', entityId: parts[1], filters };
  }
  if (parts[0] === 'leads' && parts[1] && UUID_RE.test(parts[1])) {
    return { route: pathname, entityType: 'lead', entityId: parts[1], filters };
  }
  if (parts[0] === 'inbox' || parts[0] === 'telegram') {
    if (threadParam && UUID_RE.test(threadParam)) {
      return { route: pathname, entityType: 'thread', entityId: threadParam, filters };
    }
    if (parts[1] && UUID_RE.test(parts[1])) {
      return { route: pathname, entityType: 'thread', entityId: parts[1], filters };
    }
  }
  if (parts[0] === 'calendar') {
    const focus = params.get('focus')?.trim() || undefined;
    if (focus && UUID_RE.test(focus)) {
      return { route: pathname, entityType: 'event', entityId: focus, filters };
    }
    return { route: pathname, entityType: 'calendar', entityId: null, filters };
  }
  if (parts[0] === 'security') {
    return { route: pathname, entityType: 'none', entityId: null, filters };
  }
  if (parts[0] === 'review-queue') {
    return { route: pathname, entityType: 'review', entityId: null, filters };
  }
  return { route: pathname || '/overview', entityType: 'none', entityId: null, filters };
}

export function parseOperatorEnvelope(raw: unknown): OperatorEnvelope {
  const parsed = operatorEnvelopeSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { route: '/overview', entityType: 'none', entityId: null };
}
