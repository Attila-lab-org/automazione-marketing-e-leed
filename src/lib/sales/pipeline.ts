import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import { estimateCostUsd } from '@/lib/ai/costs';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { mockClassifyInbound, mockDraftReply } from '@/lib/ai/commercial/mock-impl';
import type {
  InboundClassification,
  SalesThreadMemorySnapshot,
  SalesThreadTurn,
} from '@/lib/ai/commercial/schemas';
import { getCurrentPlaybook } from './playbook-store';
import type { ResponseMode } from './playbook';
import { resolveInboundCommercialState, type SalesState } from './states';
import { getActiveAutonomy } from './autonomy';
import { criticSalesReply } from '@/lib/ai/commercial/grounding';
import { alertKindFromInbound, persistSalesReplyDraft, recordOperatorAlert } from './reply-persist';

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

function uniqueStrings(values: string[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function memorySnapshot(memory: SalesMemory | null): SalesThreadMemorySnapshot | null {
  if (!memory) return null;
  return {
    main_need: memory.main_need,
    services_requested: memory.services_requested,
    next_step: memory.next_step,
    pricing_discussed: memory.pricing_discussed,
    sentiment: memory.sentiment,
  };
}

async function loadRecentTurns(
  admin: AppSupabaseClient,
  threadId: string,
): Promise<SalesThreadTurn[]> {
  const { data } = await admin
    .from('messages')
    .select('direction, body_snapshot')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: false })
    .limit(8);
  return (data ?? [])
    .reverse()
    .flatMap((row) => {
      const text = typeof row.body_snapshot === 'string' ? row.body_snapshot.trim() : '';
      if (!text) return [];
      if (row.direction !== 'INBOUND' && row.direction !== 'OUTBOUND') return [];
      return [{ direction: row.direction, text: text.slice(0, 800) }];
    });
}

export function resolveResponseMode(args: {
  classification: InboundClassification;
  playbook: Awaited<ReturnType<typeof getCurrentPlaybook>>;
  autonomy: Awaited<ReturnType<typeof getActiveAutonomy>>;
  firstReply: boolean;
  channel?: 'EMAIL' | 'TELEGRAM';
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
  if (args.autonomy?.humanIntents.includes(c.intent)) {
    return { mode: 'HUMAN_ONLY', reason: 'autonomy_human_intent' };
  }
  if (
    args.autonomy?.autoIntents.includes(c.intent) &&
    c.confidence >= (args.autonomy.minConfidence ?? 0.7)
  ) {
    return { mode: 'AUTO_ALLOWED', reason: 'autonomy_auto_intent' };
  }
  if (args.channel === 'TELEGRAM') {
    return { mode: 'AUTO_ALLOWED', reason: 'telegram_conversation' };
  }
  if (args.firstReply) return { mode: args.playbook.autonomy.firstReplyMode, reason: 'first_reply' };
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
  const priorMemory = await loadSalesMemory(args.admin, args.threadId);
  const recentTurns = await loadRecentTurns(args.admin, args.threadId);
  const memory = memorySnapshot(priorMemory);
  let classification: InboundClassification;
  try {
    const provider = getAICommercialProvider(env);
    const route = resolveModel('classify_inbound', env);
    const result = await provider.classifyInbound(
      { text: args.text, recentTurns, memory },
      { model: route.model },
    );
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
    channel: args.channel,
  });
  const state = resolveInboundCommercialState({
    from: thread?.commercial_state,
    recommended: classification.recommendedState,
    humanOnly: resolved.mode === 'HUMAN_ONLY',
  });

  const keepPriorNeed =
    Boolean(priorMemory?.main_need) &&
    classification.servicesRequested.length === 0 &&
    (classification.intent === 'info_request' ||
      classification.intent === 'greeting' ||
      classification.intent === 'other');
  await upsertSalesMemory(args.admin, args.workspaceId, args.threadId, {
    main_need: keepPriorNeed ? priorMemory?.main_need ?? classification.summary : classification.summary,
    services_requested: uniqueStrings([
      ...(priorMemory?.services_requested ?? []),
      ...classification.servicesRequested,
    ]),
    pricing_discussed:
      Boolean(priorMemory?.pricing_discussed) || classification.pricing || classification.discountAsk,
    sentiment: classification.sentiment,
    timing: classification.followUpLater ? classification.summary : priorMemory?.timing ?? null,
    next_step: classification.followUpLater ? 'follow_up_later' : classification.intent,
    risk_flags: uniqueStrings([
      ...(priorMemory?.risk_flags ?? []),
      ...(classification.unsubscribe ? ['unsubscribe'] : []),
      ...(classification.discountAsk ? ['discount'] : []),
      ...(classification.angry ? ['angry'] : []),
    ]),
  });

  const humanRequired = resolved.mode === 'HUMAN_ONLY';
  const hot =
    classification.discountAsk || classification.angry || classification.intent === 'quote_request';
  await args.admin
    .from('message_threads')
    .update({
      channel: args.channel,
      commercial_state: state,
      assigned_mode: humanRequired ? 'HUMAN' : 'AI',
      sentiment: classification.sentiment,
      next_step: classification.summary,
      priority: hot ? 'HOT' : 'NORMAL',
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
        inboundText: args.text,
        recentTurns,
        memory,
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
      inboundText: args.text,
      recentTurns,
      memory,
    }).text;
  }

  let critic = draftText
    ? criticSalesReply(
        draftText,
        [classification.summary, memory?.main_need ?? '', ...classification.servicesRequested].filter(Boolean),
        {
          pricingAllowed: playbook.pricing.aiMayCommunicate,
          discountAllowed: playbook.discount.allowed,
        },
      )
    : null;
  let mode = resolved.mode;
  if (mode === 'AUTO_ALLOWED' && critic && critic.verdict !== 'PASS') {
    mode = 'APPROVAL_REQUIRED';
    critic = { ...critic, verdict: 'HUMAN_REVIEW' };
  }
  // Inbound email has no Send Guard channel adapter; drafts stay in Messaggi.
  if (args.channel === 'EMAIL' && mode === 'AUTO_ALLOWED') {
    mode = 'APPROVAL_REQUIRED';
  }

  await persistSalesReplyDraft({
    admin: args.admin,
    workspaceId: args.workspaceId,
    threadId: args.threadId,
    leadId: args.leadId,
    classification,
    state,
    mode,
    draft: draftText,
    critic,
  });

  const alertKind = alertKindFromInbound(classification, mode, critic);
  if (alertKind) {
    await recordOperatorAlert({
      admin: args.admin,
      workspaceId: args.workspaceId,
      leadId: args.leadId,
      threadId: args.threadId,
      kind: alertKind,
      message: `Attila: ${alertKind} — ${classification.summary}`,
    });
  }

  return {
    classification,
    state,
    mode,
    draft: draftText,
    humanRequired,
  };
}
