import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import type { InboundClassification } from '@/lib/ai/commercial/schemas';
import type { OutboundCritique } from '@/lib/ai/commercial/schemas';
import type { ResponseMode } from './playbook';
import type { SalesState } from './states';

export type PersistedSalesDraft = {
  understanding: string;
  text: string;
  state: string;
  mode: ResponseMode;
  criticVerdict: string | null;
};

export async function persistSalesReplyDraft(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  leadId: string;
  classification: InboundClassification;
  state: SalesState;
  mode: ResponseMode;
  draft: string | null;
  critic: OutboundCritique | null;
}): Promise<void> {
  await args.admin.from('sales_thread_events').insert({
    workspace_id: args.workspaceId,
    thread_id: args.threadId,
    actor: 'AI',
    event_type: 'AI_REPLY_DRAFT',
    payload: {
      understanding: args.classification.summary,
      intent: args.classification.intent,
      text: args.draft,
      state: args.state,
      mode: args.mode,
      critic: args.critic,
      pricing: args.classification.pricing,
      discountAsk: args.classification.discountAsk,
    } as unknown as Json,
  });
}

export async function loadLatestSalesDraft(
  admin: AppSupabaseClient,
  threadId: string,
): Promise<PersistedSalesDraft | null> {
  const { data } = await admin
    .from('sales_thread_events')
    .select('payload')
    .eq('thread_id', threadId)
    .eq('event_type', 'AI_REPLY_DRAFT')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.payload && typeof data.payload === 'object' ? (data.payload as Record<string, unknown>) : null;
  if (!payload) return null;
  return {
    understanding: typeof payload.understanding === 'string' ? payload.understanding : '',
    text: typeof payload.text === 'string' ? payload.text : '',
    state: typeof payload.state === 'string' ? payload.state : '',
    mode: (typeof payload.mode === 'string' ? payload.mode : 'APPROVAL_REQUIRED') as ResponseMode,
    criticVerdict:
      payload.critic && typeof payload.critic === 'object'
        ? String((payload.critic as { verdict?: string }).verdict ?? '')
        : null,
  };
}

export async function recordOperatorAlert(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  leadId: string;
  threadId: string;
  kind: string;
  message: string;
}): Promise<void> {
  await args.admin.from('activity_log').insert({
    workspace_id: args.workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'lead',
    entity_id: args.leadId,
    lead_id: args.leadId,
    category: 'BUSINESS',
    event_type: 'OPERATOR_ALERT',
    message: args.message,
    data: { kind: args.kind, threadId: args.threadId } as unknown as Json,
  });
}

export function alertKindFromInbound(
  c: InboundClassification,
  mode: ResponseMode,
  critic?: { verdict?: string } | null,
): string | null {
  if (c.angry) return 'angry';
  if (c.legal) return 'legal';
  if (c.discountAsk) return 'discount';
  if (c.pricing) return 'pricing';
  if (mode === 'HUMAN_ONLY') return 'HUMAN_REQUIRED';
  if (critic && critic.verdict && critic.verdict !== 'PASS') return 'failed_ai_reply';
  return null;
}
