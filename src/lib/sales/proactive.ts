import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';

export type ProactiveStepDecision = {
  due: boolean;
  reason: 'DUE' | 'NOT_DUE' | 'STATE_CHANGED' | 'THREAD_MISSING';
  summary: string;
};

export function decideProactiveStep(
  thread: { commercial_state: string; next_step_at: string | null } | null,
  now = new Date(),
): ProactiveStepDecision {
  if (!thread) {
    return { due: false, reason: 'THREAD_MISSING', summary: 'Conversazione non trovata' };
  }
  if (thread.commercial_state !== 'FOLLOW_UP_LATER') {
    return {
      due: false,
      reason: 'STATE_CHANGED',
      summary: 'Il contatto è già avanzato: ricontatto non più necessario',
    };
  }
  if (!thread.next_step_at || new Date(thread.next_step_at).getTime() > now.getTime()) {
    return { due: false, reason: 'NOT_DUE', summary: 'Ricontatto non ancora in scadenza' };
  }
  return {
    due: true,
    reason: 'DUE',
    summary: 'Ricontatto commerciale in scadenza: prepara il prossimo messaggio',
  };
}

export async function runProactiveSalesStep(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  now?: Date;
}): Promise<ProactiveStepDecision> {
  const { data: thread } = await args.admin
    .from('message_threads')
    .select('id, lead_id, commercial_state, next_step_at')
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.threadId)
    .maybeSingle();
  const decision = decideProactiveStep(thread, args.now);
  if (!decision.due || !thread) return decision;

  const occurredAt = (args.now ?? new Date()).toISOString();
  const { data: claimed } = await args.admin
    .from('message_threads')
    .update({
      commercial_state: 'ENGAGED',
      priority: 'HOT',
      status: 'NEEDS_REPLY',
      next_step: 'proactive_follow_up',
      next_step_at: null,
      updated_at: occurredAt,
    })
    .eq('workspace_id', args.workspaceId)
    .eq('id', thread.id)
    .eq('commercial_state', 'FOLLOW_UP_LATER')
    .lte('next_step_at', occurredAt)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return {
      due: false,
      reason: 'STATE_CHANGED',
      summary: 'Il ricontatto è già stato gestito da un altro processo',
    };
  }

  await Promise.all([
    args.admin.from('sales_thread_events').insert({
      workspace_id: args.workspaceId,
      thread_id: thread.id,
      actor: 'AI',
      event_type: 'PROACTIVE_FOLLOW_UP_DUE',
      payload: {
        leadId: thread.lead_id,
        reason: decision.reason,
        recommendation: decision.summary,
      } as unknown as Json,
    }),
    args.admin.from('activity_log').insert({
      workspace_id: args.workspaceId,
      actor_type: 'SYSTEM',
      entity_type: 'lead',
      entity_id: thread.lead_id,
      lead_id: thread.lead_id,
      category: 'BUSINESS',
      event_type: 'AI_PROACTIVE_RECOMMENDATION',
      message: `Attila: ${decision.summary}`,
      data: {
        kind: 'follow_up_due',
        threadId: thread.id,
        recommendedAction: 'reply_now',
      } as unknown as Json,
      occurred_at: occurredAt,
    }),
  ]);

  return decision;
}
