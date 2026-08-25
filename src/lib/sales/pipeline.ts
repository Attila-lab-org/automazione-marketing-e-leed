import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import { estimateCostUsd } from '@/lib/ai/costs';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { mockClassifyInbound, mockDraftReply } from '@/lib/ai/commercial/mock-impl';
import type { InboundClassification } from '@/lib/ai/commercial/schemas';
import { getCurrentPlaybook } from './playbook-store';
import { validateSalesTransition, type SalesState } from './states';
import { getActiveAutonomy } from './autonomy';
import type { ResponseMode } from './playbook';

export type SalesMemory = {
  business_summary: string | null;
  main_need: string | null;
  services_requested: string[];
  budget_signal: string | null;
  pricing_discussed: boolean;
  objections: string[];
  timing: string | null;
  sentiment: string | null;
  last_commitment: string | null;
  next_step: string | null;
  next_step_at: string | null;
  risk_flags: string[];
};

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

export async function loadSalesMemory(
  admin: AppSupabaseClient,
  threadId: string,
): Promise<SalesMemory | null> {
  const { data } = await admin
    .from('sales_thread_memory')
    .select(
      'business_summary, main_need, services_requested, budget_signal, pricing_discussed, objections, timing, sentiment, last_commitment, next_step, next_step_at, risk_flags',
    )
    .eq('thread_id', threadId)
    .maybeSingle();
  if (!data) return null;
  return {
    business_summary: data.business_summary,
    main_need: data.main_need,
    services_requested: asStringList(data.services_requested),
    budget_signal: data.budget_signal,
    pricing_discussed: data.pricing_discussed,
    objections: asStringList(data.objections),
    timing: data.timing,
    sentiment: data.sentiment,
    last_commitment: data.last_commitment,
    next_step: data.next_step,
    next_step_at: data.next_step_at,
    risk_flags: asStringList(data.risk_flags),
  };
}

export async function upsertSalesMemory(
  admin: AppSupabaseClient,
  workspaceId: string,
  threadId: string,
  patch: Partial<SalesMemory>,
) {
  const current = (await loadSalesMemory(admin, threadId)) ?? {
    business_summary: null,
    main_need: null,
    services_requested: [],
    budget_signal: null,
    pricing_discussed: false,
    objections: [],
    timing: null,
    sentiment: null,
    last_commitment: null,
    next_step: null,
    next_step_at: null,
    risk_flags: [],
  };
  const next = { ...current, ...patch };
  await admin.from('sales_thread_memory').upsert({
    thread_id: threadId,
    workspace_id: workspaceId,
    business_summary: next.business_summary,
    main_need: next.main_need,
    services_requested: next.services_requested as unknown as Json,
    budget_signal: next.budget_signal,
    pricing_discussed: next.pricing_discussed,
    objections: next.objections as unknown as Json,
    timing: next.timing,
    sentiment: next.sentiment,
    last_commitment: next.last_commitment,
    next_step: next.next_step,
    next_step_at: next.next_step_at,
    risk_flags: next.risk_flags as unknown as Json,
    updated_at: new Date().toISOString(),
  });
}

export function resolveResponseMode(args: {
  classification: InboundClassification;
  playbook: Awaited<ReturnType<typeof getCurrentPlaybook>>;
  autonomy: Awaited<ReturnType<typeof getActiveAutonomy>>;
  firstReply: boolean;
}): { mode: ResponseMode; reason: string } {
  const c = args.classification;
  if (c.unsubscribe || c.notInterested) {
    return { mode: 'HUMAN_ONLY', reason: 'stop_deterministic' };
  }
  if (c.discountAsk || (c.pricing && args.playbook.humanEscalation.price && !args.playbook.pricing.aiMayCommunicate)) {
    return { mode: 'HUMAN_ONLY', reason: 'pricing' };
  }
  if (c.legal || c.angry || c.confidence < 0.45) {
    return { mode: 'HUMAN_ONLY', reason: c.angry ? 'angry' : c.legal ? 'legal' : 'low_confidence' };
  }
  if (args.firstReply) return { mode: args.playbook.autonomy.firstReplyMode, reason: 'first_reply' };
  if (args.autonomy?.humanIntents.includes(c.intent)) {
    return { mode: 'HUMAN_ONLY', reason: 'autonomy_human_intent' };
  }
  if (
    args.autonomy?.autoIntents.includes(c.intent) &&
    c.confidence >= (args.autonomy.minConfidence ?? 0.7)
  ) {
    return { mode: 'AUTO_ALLOWED', reason: 'autonomy_auto_intent' };
  }
  return { mode: args.playbook.autonomy.defaultMode, reason: 'playbook_default' };
}

export async function processSalesInbound(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  threadId: string;
  leadId: string;
  text: string;
  channel: 'EMAIL' | 'TELEGRAM';
  env?: NodeJS.ProcessEnv;
}): Promise<{
  classification: InboundClassification;
  state: SalesState;
  mode: ResponseMode;
  draft: string | null;
  humanRequired: boolean;
}> {
  const env = args.env ?? process.env;
  const playbook = await getCurrentPlaybook(args.admin, args.workspaceId);
  const autonomy = await getActiveAutonomy(args.admin, args.workspaceId);
  let classification: InboundClassification;
  try {
    const provider = getAICommercialProvider(env);
    const route = resolveModel('classify_inbound', env);
    const result = await provider.classifyInbound({ text: args.text }, { model: route.model });
    classification = result.output;
    const persist = createSupabaseAiRunStore(args.admin);
    await persist({
      workspaceId: args.workspaceId,
      provider: getAiCommercialConfig(env).mode,
      model: result.model,
      taskType: 'classify_inbound',
      threadId: args.threadId,
      leadId: args.leadId,
      usage: result.usage,
      estimatedCostUsd: estimateCostUsd(result.usage, route.tier, env),
      latencyMs: 0,
      status: 'ok',
      requestId: result.requestId,
    });
  } catch {
    classification = mockClassifyInbound(args.text);
  }

  const { data: thread } = await args.admin
    .from('message_threads')
    .select('commercial_state, assigned_mode')
    .eq('id', args.threadId)
    .maybeSingle();

  const transition = validateSalesTransition(thread?.commercial_state, classification.recommendedState);
  const state = transition.ok ? transition.state : 'HUMAN_REQUIRED';

  const { count: outboundCount } = await args.admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', args.threadId)
    .eq('direction', 'OUTBOUND');
  const firstReply = (outboundCount ?? 0) === 0;
  const resolved = resolveResponseMode({
    classification,
    playbook,
    autonomy,
    firstReply,
  });

  await upsertSalesMemory(args.admin, args.workspaceId, args.threadId, {
    main_need: classification.summary,
    services_requested: classification.servicesRequested,
    pricing_discussed: classification.pricing || classification.discountAsk,
    sentiment: classification.sentiment,
    timing: classification.followUpLater ? classification.summary : null,
    next_step: classification.followUpLater ? 'follow_up_later' : classification.intent,
    risk_flags: [
      ...(classification.unsubscribe ? ['unsubscribe'] : []),
      ...(classification.discountAsk ? ['discount'] : []),
      ...(classification.angry ? ['angry'] : []),
    ],
  });

  const humanRequired = resolved.mode === 'HUMAN_ONLY' || state === 'HUMAN_REQUIRED';
  await args.admin
    .from('message_threads')
    .update({
      channel: args.channel,
      commercial_state: state,
      assigned_mode: humanRequired ? 'HUMAN' : 'AI',
      sentiment: classification.sentiment,
      next_step: classification.summary,
      human_required_reason: humanRequired
        ? classification.discountAsk
          ? 'Negotiation / pricing'
          : resolved.reason
        : null,
      status: humanRequired ? 'NEEDS_REPLY' : 'OPEN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.threadId);

  await args.admin.from('sales_thread_events').insert({
    workspace_id: args.workspaceId,
    thread_id: args.threadId,
    actor: 'SYSTEM',
    event_type: 'INBOUND_CLASSIFIED',
    payload: {
      intent: classification.intent,
      state,
      mode: resolved.mode,
      reason: resolved.reason,
    } as unknown as Json,
  });

  if (classification.unsubscribe || classification.notInterested) {
    return { classification, state, mode: resolved.mode, draft: null, humanRequired: true };
  }

  let draftText: string | null = null;
  try {
    const provider = getAICommercialProvider(env);
    const route = resolveModel('draft_reply', env);
    const priceRange =
      playbook.pricing.aiMayCommunicate && playbook.pricing.min != null && playbook.pricing.max != null
        ? `${playbook.pricing.min}–${playbook.pricing.max} €`
        : null;
    const drafted = await provider.draftReply(
      {
        classification,
        playbookName: playbook.brand.signature,
        pricingAllowed: playbook.pricing.aiMayCommunicate,
        priceRange,
        bookingUrl: playbook.call.bookingUrl,
        allowedFeatures: playbook.offer.allowedFeatures,
      },
      { model: route.model },
    );
    draftText = drafted.output.text;
  } catch {
    draftText = mockDraftReply({
      classification,
      playbookName: playbook.brand.signature,
      pricingAllowed: playbook.pricing.aiMayCommunicate,
      allowedFeatures: playbook.offer.allowedFeatures,
      bookingUrl: playbook.call.bookingUrl,
    }).text;
  }

  return {
    classification,
    state,
    mode: resolved.mode,
    draft: draftText,
    humanRequired,
  };
}
