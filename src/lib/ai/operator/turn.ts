import type { DemoPersonalization } from '@/lib/ai/commercial/schemas';
import { estimateCostUsd, estimateTokensFromText } from '@/lib/ai/costs';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import type { PersistAiRun } from '@/lib/ai/persist';
import type { AiRunPublic } from '@/lib/ai/types';
import { assertNoSecrets } from '@/lib/ai/readiness';
import type { OperatorAction } from './actions';
import { composeOperatorReply } from './compose';
import { composeOrchestratorReply } from './compose-orchestrator';
import { registeredNowWriteCapabilities, registeredReadCapabilities, type OperatorAssistMode } from './capabilities';
import {
  emptyEntityRefs,
  extractOperatorPreference,
  mergeEntityRefs,
  resolveOrdinalSelection,
  resolveOperatorEnvelope,
  type OperatorEntityRefs,
} from './context';
import type { OperatorEnvelope } from './envelope';
import {
  ATTILA_UNAVAILABLE_REPLY,
  classifyOperatorIntent,
  isAttilaAvailabilityQuestion,
  isBulkCampaignWipe,
  isOpenedCampaignFollowup,
} from './intent';
import type { OperatorHistoryItem, OperatorPlan } from './orchestrator-schema';
import { OPERATOR_ORCHESTRATOR_PROMPT_VERSION } from './orchestrator-schema';
import { applySafetyPolicy, isTelegramReplyRequest, planOperatorTurnMock } from './semantic-plan';
import { detectOperatorOpsAction } from './ops-writes';
import {
  executeOperatorTool,
  OPERATOR_TOOL_NAMES,
  plannedFromOrchestratorCall,
  TOOL_LABELS,
  type CampaignDetail,
  type LeadSearchHit,
  type OperatorDataSource,
  type OperatorToolName,
} from './registry';
import type { WriteResult } from './writes';

export type OperatorStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_done'; name: string; ok: boolean; label: string; count?: number }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      reply: string;
      actions: OperatorAction[];
      run: AiRunPublic | null;
      persisted: boolean;
      refs: OperatorEntityRefs;
    }
  | { type: 'error'; message: string };

export type OperatorWriteHooks = {
  discover?: (input: {
    category: string;
    location: string;
    limit: number;
  }) => Promise<{
    found: number;
    created: number;
    duplicates: number;
    qualified: number;
    leads: LeadSearchHit[];
  }>;
  prepare?: (input: {
    leads: LeadSearchHit[];
    campaignId: string | null;
    verb: string | null;
  }) => Promise<WriteResult[]>;
  sendPending?: (campaignId: string) => Promise<WriteResult>;
  proposePolicy?: (question: string) => Promise<WriteResult>;
  campaignMutation?: (input: {
    verb: 'cancel' | 'hard_delete';
    campaignId: string | null;
    campaign: CampaignDetail | null;
  }) => Promise<WriteResult[]>;
  personalizeDemo?: (input: { leadId: string | null; demoId: string | null }) => Promise<WriteResult[]>;
  applyDemo?: (input: {
    demoId: string;
    proposal: DemoPersonalization | null;
  }) => Promise<WriteResult[]>;
  replyTelegram?: () => Promise<WriteResult>;
  runOps?: (action: Exclude<import('./ops-writes').OperatorOpsAction, 'none'>) => Promise<WriteResult>;
  goalCommand?: (question: string) => Promise<WriteResult | null>;
};

export type OperatorTurnInput = {
  workspaceId: string;
  sessionId: string;
  question: string;
  envelope: OperatorEnvelope;
  data: OperatorDataSource;
  persist: PersistAiRun;
  env?: NodeJS.ProcessEnv;
  writes?: OperatorWriteHooks;
  refs?: OperatorEntityRefs;
  assistMode?: OperatorAssistMode;
  history?: OperatorHistoryItem[];
};

function toolDoneLabel(name: string, done: string, count?: number): string {
  if (name === 'get_blockers') {
    if (count == null) return 'Ho controllato cosa blocca';
    return count === 0 ? 'Nessun problema trovato' : `Trovati ${count} problemi`;
  }
  if (count == null) return done;
  return `${done} (${count})`;
}

function mapIntentToSafety(
  kind: ReturnType<typeof classifyOperatorIntent>['kind'],
): OperatorPlan['safetyClass'] {
  if (kind === 'PREPARE' || kind === 'EXTERNAL' || kind === 'DESTRUCTIVE' || kind === 'POLICY' || kind === 'HELP') {
    return kind;
  }
  if (kind === 'READ') return 'READ';
  return 'UNKNOWN';
}

function clampElevation(
  model: OperatorPlan['safetyClass'],
  fallback: OperatorPlan['safetyClass'],
): OperatorPlan['safetyClass'] {
  if (fallback === 'EXTERNAL' || fallback === 'DESTRUCTIVE') return fallback;
  if (
    (model === 'EXTERNAL' || model === 'DESTRUCTIVE') &&
    (fallback === 'READ' || fallback === 'PREPARE' || fallback === 'HELP' || fallback === 'POLICY')
  ) {
    return fallback;
  }
  if (model === 'UNKNOWN') return fallback === 'UNKNOWN' ? 'UNKNOWN' : fallback;
  return model;
}

export async function* runOperatorTurn(
  input: OperatorTurnInput,
): AsyncGenerator<OperatorStreamEvent> {
  const turnStartedAt = Date.now();
  let planningMs = 0;
  let toolsMs = 0;
  let writesMs = 0;
  let composeMs = 0;
  yield { type: 'session', sessionId: input.sessionId };
  const env = input.env ?? process.env;
  const config = getAiCommercialConfig(env);
  const assistMode = input.assistMode ?? 'ASSISTITO';
  let fallbackIntent = classifyOperatorIntent(input.question);
  const telegramReplyRequested = isTelegramReplyRequest(input.question);
  const opsAction = detectOperatorOpsAction(input.question, {
    entityType: input.envelope.entityType,
    route: input.envelope.route,
  });
  let prevRefs = input.refs ?? emptyEntityRefs();
  if (input.envelope.entityType === 'thread' && input.envelope.entityId) {
    prevRefs = { ...prevRefs, lastThreadId: input.envelope.entityId };
  }
  if (input.envelope.entityType === 'event' && input.envelope.entityId) {
    prevRefs = { ...prevRefs, lastEventId: input.envelope.entityId };
  }
  if (
    fallbackIntent.kind !== 'DESTRUCTIVE' &&
    isOpenedCampaignFollowup(input.question) &&
    (input.envelope.entityType === 'campaign' || prevRefs.lastCampaignId)
  ) {
    fallbackIntent = { ...fallbackIntent, kind: 'DESTRUCTIVE', writeVerb: 'cancel' };
  }
  const rememberedPreference = extractOperatorPreference(input.question);
  if (rememberedPreference) {
    prevRefs = {
      ...prevRefs,
      preferences: [
        ...prevRefs.preferences.filter(
          (item) => item.toLocaleLowerCase('it-IT') !== rememberedPreference.toLocaleLowerCase('it-IT'),
        ),
        rememberedPreference,
      ].slice(-8),
    };
  }
  const envelope = resolveOperatorEnvelope(input.question, input.envelope, prevRefs, fallbackIntent);

  if (isAttilaAvailabilityQuestion(input.question, input.history)) {
    yield { type: 'delta', text: ATTILA_UNAVAILABLE_REPLY };
    yield {
      type: 'done',
      reply: ATTILA_UNAVAILABLE_REPLY,
      actions: [],
      run: null,
      persisted: false,
      refs: prevRefs,
    };
    return;
  }

  if (rememberedPreference) {
    const reply = `Va bene, lo terrò a mente: ${rememberedPreference}.`;
    yield { type: 'delta', text: reply };
    yield {
      type: 'done',
      reply,
      actions: [],
      run: null,
      persisted: false,
      refs: prevRefs,
    };
    return;
  }

  if (input.writes?.goalCommand) {
    const goalWrite = await input.writes.goalCommand(input.question);
    if (goalWrite) {
      yield {
        type: 'tool_start',
        name: goalWrite.tool,
        label: 'Sto configurando l’obiettivo commerciale…',
      };
      yield {
        type: 'tool_done',
        name: goalWrite.tool,
        ok: goalWrite.ok,
        label: goalWrite.summary,
      };
      yield { type: 'delta', text: goalWrite.summary };
      yield {
        type: 'done',
        reply: goalWrite.summary,
        actions: [],
        run: null,
        persisted: false,
        refs: prevRefs,
      };
      return;
    }
  }

  const traces: Array<{ name: OperatorToolName; result: unknown; ok: boolean }> = [];
  const writes: WriteResult[] = [];
  let aiUnavailable = false;
  let plan: OperatorPlan;
  let usage = {
    inputTokens: estimateTokensFromText(input.question),
    cachedInputTokens: 0,
    outputTokens: 0,
  };
  let modelName = resolveModel('answer_operator', env).model;
  let requestId: string | null = null;

  const planningStartedAt = Date.now();
  try {
    const provider = getAICommercialProvider(env);
    const route = resolveModel('answer_operator', env);
    modelName = route.model;
    const planned = await provider.answerOperator(
      {
        question: input.question,
        history: (input.history ?? []).slice(-20),
        refs: prevRefs,
        envelope,
        assistMode,
        allowedTools: [...OPERATOR_TOOL_NAMES],
        capabilities: [...registeredNowWriteCapabilities(), ...registeredReadCapabilities()],
      },
      { model: route.model },
    );
    usage = {
      inputTokens: usage.inputTokens + planned.usage.inputTokens,
      cachedInputTokens: planned.usage.cachedInputTokens,
      outputTokens: planned.usage.outputTokens,
    };
    requestId = planned.requestId;
    plan = applySafetyPolicy(planned.output, input.question, {
      entityType: input.envelope.entityType,
      route: input.envelope.route,
    });
  } catch {
    if (config.mode === 'openai') {
      aiUnavailable = true;
      plan = {
        safetyClass: 'UNKNOWN',
        goal: 'fallback',
        toolCalls: [],
        ordinal: null,
        clarification: ATTILA_UNAVAILABLE_REPLY,
        telegramIsInboundScan: false,
        prepareKind: 'none',
      };
    } else {
      throw new Error('Orchestratore mock non disponibile');
    }
  }
  planningMs = Date.now() - planningStartedAt;

  plan.safetyClass = clampElevation(plan.safetyClass, mapIntentToSafety(fallbackIntent.kind));
  const naturalDemoBatch =
    fallbackIntent.kind === 'PREPARE' &&
    /demo|anteprim|propost[ae] (?:visiv|sito)|siti? dimostrativ/i.test(input.question);
  if (!aiUnavailable && naturalDemoBatch) {
    plan = applySafetyPolicy(
      planOperatorTurnMock({
        question: input.question,
        history: input.history,
        refs: prevRefs,
        envelope,
      }),
      input.question,
      { entityType: input.envelope.entityType, route: input.envelope.route },
    );
  }
  prevRefs = resolveOrdinalSelection(plan.ordinal, prevRefs);

  const maxCalls = Math.min(config.maxToolCalls, 8);
  const plannedCalls = aiUnavailable
    ? []
    : plan.toolCalls.slice(0, maxCalls).map(plannedFromOrchestratorCall);

  const toolsStartedAt = Date.now();
  for (const call of plannedCalls) {
    const labels = TOOL_LABELS[call.name];
    yield { type: 'tool_start', name: call.name, label: labels.start };
    const executed = await executeOperatorTool(call.name, call.args, input.data, envelope);
    if (!executed.ok) {
      traces.push({ name: call.name, result: { error: executed.error }, ok: false });
      yield { type: 'tool_done', name: call.name, ok: false, label: executed.error };
      continue;
    }
    traces.push({ name: executed.name, result: executed.result, ok: true });
    const count = Array.isArray(executed.result) ? executed.result.length : undefined;
    yield {
      type: 'tool_done',
      name: executed.name,
      ok: true,
      label: toolDoneLabel(executed.name, labels.done, count),
      count,
    };
  }
  toolsMs = Date.now() - toolsStartedAt;

  const writesStartedAt = Date.now();
  if (opsAction !== 'none' && input.writes?.runOps) {
    const labels: Record<string, string> = {
      reply_telegram: 'Sto rispondendo su Telegram…',
      take_over: 'Sto passando in gestione manuale…',
      return_to_ai: 'Sto riattivando Attila…',
      stop_automation: 'Sto fermando l’automazione…',
      create_slot: 'Sto aggiungendo disponibilità…',
      cancel_appointment: 'Sto annullando l’appuntamento…',
      reschedule_appointment: 'Sto riprogrammando…',
      start_telegram: 'Sto avviando Telegram…',
      stop_telegram: 'Sto fermando Telegram…',
      close_won: 'Sto chiudendo il cliente pagato…',
      archive_thread: 'Sto archiviando la conversazione…',
      archive_all_threads: 'Sto archiviando le conversazioni aperte…',
      drop_thread: 'Sto togliendo la conversazione dalle code…',
      dismiss_todo: 'Sto togliendo l’attività dalla coda…',
    };
    yield {
      type: 'tool_start',
      name: opsAction,
      label: labels[opsAction] ?? 'Sto eseguendo l’azione…',
    };
    const opsResult = await input.writes.runOps(opsAction);
    writes.push(opsResult);
    yield {
      type: 'tool_done',
      name: opsAction,
      ok: opsResult.ok,
      label: opsResult.summary,
    };
  } else if (telegramReplyRequested && input.writes?.replyTelegram) {
    yield { type: 'tool_start', name: 'reply_telegram', label: 'Sto rispondendo su Telegram…' };
    const replied = await input.writes.replyTelegram();
    writes.push(replied);
    yield {
      type: 'tool_done',
      name: 'reply_telegram',
      ok: replied.ok,
      label: replied.summary,
    };
  }

  const detail = traces.find((t) => t.name === 'get_lead_detail' && t.ok)?.result as LeadSearchHit | null | undefined;
  const searched = (traces.find((t) => t.name === 'search_leads' && t.ok)?.result ?? []) as LeadSearchHit[];
  const leadHits = (detail ? [detail, ...searched] : searched).filter((row) => row && row.id);
  if (plan.ordinal && prevRefs.lastLeadIds[plan.ordinal - 1]) {
    const picked = leadHits.find((l) => l.id === prevRefs.lastLeadIds[plan.ordinal! - 1]);
    if (picked && !detail) leadHits.unshift(picked);
  }
  if (
    plan.prepareKind === 'campaign' &&
    leadHits.length === 0 &&
    (prevRefs.lastLeadIds.length > 0 || prevRefs.lastLeadId)
  ) {
    const inferredIds = prevRefs.lastLeadIds.length ? prevRefs.lastLeadIds : prevRefs.lastLeadId ? [prevRefs.lastLeadId] : [];
    for (const id of inferredIds.slice(0, 20)) {
      if (leadHits.some((row) => row.id === id)) continue;
      const row = await input.data.getLeadDetail(id);
      if (row?.id) leadHits.push(row);
    }
  }
  const plannedLeadSearch = plannedCalls.find((call) => call.name === 'search_leads');
  const discoveryCity =
    fallbackIntent.city ??
    (typeof plannedLeadSearch?.args.city === 'string' ? plannedLeadSearch.args.city : null);
  const discoveryCategory =
    fallbackIntent.category ??
    (typeof plannedLeadSearch?.args.category === 'string' ? plannedLeadSearch.args.category : null);
  if (
    plan.safetyClass === 'PREPARE' &&
    plan.prepareKind === 'campaign' &&
    leadHits.length === 0 &&
    discoveryCity &&
    discoveryCategory &&
    input.writes?.discover
  ) {
    yield {
      type: 'tool_start',
      name: 'discover_leads',
      label: `Non ci sono contatti adatti: cerco ${discoveryCategory} a ${discoveryCity} su Google…`,
    };
    try {
      const discovered = await input.writes.discover({
        category: discoveryCategory,
        location: discoveryCity,
        limit: fallbackIntent.limit,
      });
      leadHits.push(...discovered.leads);
      writes.push({
        tool: 'discover_leads',
        ok: true,
        summary: `Ricerca Google completata: ${discovered.found} trovati, ${discovered.created} nuovi, ${discovered.duplicates} già presenti.`,
        data: {
          found: discovered.found,
          created: discovered.created,
          duplicates: discovered.duplicates,
          qualified: discovered.qualified,
        },
      });
      yield {
        type: 'tool_done',
        name: 'discover_leads',
        ok: true,
        label: `${discovered.found} attività trovate su Google`,
        count: discovered.found,
      };
    } catch (reason) {
      const summary =
        reason instanceof Error ? `Ricerca Google non riuscita: ${reason.message}` : 'Ricerca Google non riuscita.';
      writes.push({ tool: 'discover_leads', ok: false, summary, data: {} });
      yield { type: 'tool_done', name: 'discover_leads', ok: false, label: summary };
    }
  }
  const campaignId =
    (envelope.entityType === 'campaign' ? envelope.entityId : null) ?? prevRefs.lastCampaignId;
  const campaignDetail = traces.find((t) => t.name === 'get_campaign_detail' && t.ok)?.result as
    | CampaignDetail
    | null
    | undefined;

  const allowCampaignPrepare =
    plan.safetyClass === 'PREPARE' &&
    plan.prepareKind === 'campaign' &&
    !plan.telegramIsInboundScan &&
    leadHits.length > 0;

  const prepareVerb =
    plan.prepareKind === 'pause'
      ? 'pause'
      : plan.prepareKind === 'analyze'
        ? 'analyze'
        : plan.prepareKind === 'campaign'
          ? fallbackIntent.writeVerb ?? 'prepare'
          : fallbackIntent.writeVerb;

  if (allowCampaignPrepare && input.writes?.prepare) {
    yield { type: 'tool_start', name: 'prepare_campaign', label: 'Sto preparando la campagna…' };
    const prepared = await input.writes.prepare({
      leads: leadHits,
      campaignId,
      verb: prepareVerb,
    });
    writes.push(...prepared);
    yield {
      type: 'tool_done',
      name: 'prepare_campaign',
      ok: prepared.every((w) => w.ok),
      label: prepared.map((w) => w.summary).join(' '),
    };
  } else if (plan.prepareKind === 'pause' && input.writes?.prepare) {
    yield { type: 'tool_start', name: 'pause_campaign', label: 'Sto mettendo in pausa…' };
    const paused = await input.writes.prepare({ leads: [], campaignId, verb: 'pause' });
    writes.push(...paused);
    yield {
      type: 'tool_done',
      name: 'pause_campaign',
      ok: paused.every((w) => w.ok),
      label: paused.map((w) => w.summary).join(' '),
    };
  } else if (plan.prepareKind === 'analyze' && input.writes?.prepare && leadHits.length > 0) {
    yield { type: 'tool_start', name: 'analyze_business', label: 'Sto analizzando l’attività…' };
    const analyzed = await input.writes.prepare({ leads: leadHits, campaignId, verb: 'analyze' });
    writes.push(...analyzed);
    yield {
      type: 'tool_done',
      name: 'analyze_business',
      ok: analyzed.every((w) => w.ok),
      label: analyzed.map((w) => w.summary).join(' '),
    };
  } else if (plan.safetyClass === 'PREPARE' && plan.telegramIsInboundScan) {
    writes.push({
      tool: 'create_campaign',
      ok: false,
      summary: 'Telegram non crea campagne vuote. Ascolta solo i messaggi inbound configurati.',
      data: { blocked: 'telegram_inbound_not_campaign' },
    });
  } else if (plan.safetyClass === 'PREPARE' && plan.prepareKind === 'campaign' && leadHits.length === 0) {
    const targetWasProvided = Boolean(discoveryCity || discoveryCategory);
    writes.push({
      tool: 'create_campaign',
      ok: false,
      summary: targetWasProvided
        ? `Ho cercato ${discoveryCategory ?? 'attività'}${discoveryCity ? ` a ${discoveryCity}` : ''}, anche su Google, ma non ho trovato contatti utilizzabili. Non creo un invio vuoto.`
        : 'Dimmi almeno una città, un settore o quali contatti usare. Non creo un invio vuoto.',
      data: { blocked: 'empty_campaign', needsTarget: !targetWasProvided },
    });
  }

  const demoId =
    (traces.find((t) => t.name === 'inspect_demo' && t.ok)?.result as { id?: string } | undefined)?.id ??
    prevRefs.lastDemoId;
  const leadId = prevRefs.lastLeadId ?? leadHits[0]?.id ?? null;
  let proposal = prevRefs.lastDemoProposal;
  if (plan.prepareKind === 'personalize' && input.writes?.personalizeDemo) {
    yield { type: 'tool_start', name: 'personalize_demo', label: 'Sto proponendo i testi…' };
    const proposed = await input.writes.personalizeDemo({ leadId, demoId });
    writes.push(...proposed);
    const nextProposal = proposed.find((w) => w.ok)?.data.proposal;
    if (nextProposal && typeof nextProposal === 'object') {
      proposal = nextProposal as DemoPersonalization;
    }
    yield {
      type: 'tool_done',
      name: 'personalize_demo',
      ok: proposed.every((w) => w.ok),
      label: proposed.map((w) => w.summary).join(' '),
    };
  } else if (plan.prepareKind === 'apply' && demoId && input.writes?.applyDemo) {
    yield { type: 'tool_start', name: 'apply_demo_personalization', label: 'Sto applicando i testi…' };
    const applied = await input.writes.applyDemo({ demoId, proposal });
    writes.push(...applied);
    yield {
      type: 'tool_done',
      name: 'apply_demo_personalization',
      ok: applied.every((w) => w.ok),
      label: applied.map((w) => w.summary).join(' '),
    };
  }

  if (plan.safetyClass === 'DESTRUCTIVE' && isBulkCampaignWipe(input.question)) {
    writes.push({
      tool: 'campaign_mutation',
      ok: false,
      summary:
        'Non cancello in blocco tutte le campagne né le email già inviate. Quelle partite restano nel registro. Se vuoi fermare un invio, apri quella campagna e conferma la pausa.',
      data: { bulkDeleteRefused: true },
    });
  } else if (plan.safetyClass === 'DESTRUCTIVE' && opsAction === 'none') {
    yield { type: 'tool_start', name: 'campaign_mutation', label: 'Sto verificando la campagna…' };
    const mutated = input.writes?.campaignMutation
      ? await input.writes.campaignMutation({
          verb: fallbackIntent.writeVerb === 'hard_delete' ? 'hard_delete' : 'cancel',
          campaignId,
          campaign: campaignDetail && campaignDetail.id ? campaignDetail : null,
        })
      : [
          {
            tool: 'campaign_mutation',
            ok: false,
            summary: 'Questa azione richiede conferma e non cancella nulla da sola.',
            data: { needsConfirmation: true, campaignId },
          },
        ];
    writes.push(...mutated);
    yield {
      type: 'tool_done',
      name: 'campaign_mutation',
      ok: mutated.every((w) => w.ok),
      label: mutated.map((w) => w.summary).join(' '),
    };
  }

  if (plan.safetyClass === 'EXTERNAL' && opsAction === 'none' && !telegramReplyRequested) {
    const targetId =
      campaignId ?? (traces.find((t) => t.name === 'get_campaign_detail')?.result as { id?: string } | undefined)?.id;
    if (targetId && input.writes?.sendPending) {
      yield { type: 'tool_start', name: 'send_campaign', label: 'Sto preparando la conferma di invio…' };
      const pending = await input.writes.sendPending(targetId);
      writes.push(pending);
      yield { type: 'tool_done', name: 'send_campaign', ok: pending.ok, label: pending.summary };
    } else {
      writes.push({
        tool: 'send_campaign',
        ok: false,
        summary: 'Apri la campagna da inviare, poi chiedi di nuovo. Nessun invio automatico.',
        data: {},
      });
    }
  }

  if (plan.safetyClass === 'POLICY' && input.writes?.proposePolicy) {
    const proposed = await input.writes.proposePolicy(input.question);
    writes.push(proposed);
  }
  writesMs = Date.now() - writesStartedAt;

  const composeTraces = traces.filter((t) => t.ok).map((t) => ({ name: t.name, result: t.result }));
  const mappedIntent = {
    ...fallbackIntent,
    kind: plan.safetyClass === 'UNKNOWN' ? fallbackIntent.kind : plan.safetyClass,
  };
  const deterministic = composeOperatorReply(
    input.question,
    envelope,
    composeTraces,
    writes,
    mappedIntent,
    assistMode,
  );
  let replyText: string;
  let actions: OperatorAction[] = [];
  const deterministicWriteFastPath = writes.length > 0 && Boolean(deterministic.reply.trim());
  const composeStartedAt = Date.now();
  try {
    if (aiUnavailable) {
      replyText = plan.clarification ?? ATTILA_UNAVAILABLE_REPLY;
    } else if (deterministicWriteFastPath) {
      replyText = deterministic.reply;
    } else {
      const provider = getAICommercialProvider(env);
      const composeRoute = resolveModel('answer_operator_simple', env);
      const composedAi = await provider.composeOperatorAnswer(
        {
          question: input.question,
          history: (input.history ?? []).slice(-20),
          plan,
          traces: traces.map((t) => ({ name: t.name, ok: t.ok, result: t.result })),
          writeSummaries: writes.map((w) => w.summary),
          assistMode,
        },
        { model: composeRoute.model },
      );
      usage = {
        inputTokens: usage.inputTokens + composedAi.usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens + composedAi.usage.cachedInputTokens,
        outputTokens: usage.outputTokens + composedAi.usage.outputTokens,
      };
      const allowedCite = new Set<string>(traces.filter((t) => t.ok).map((t) => t.name));
      const citedOk = composedAi.output.citedTools.every((name) => allowedCite.has(name) || writes.some((w) => w.ok && w.tool === name));
      replyText = citedOk
        ? composedAi.output.reply
        : composeOrchestratorReply({
            question: input.question,
            history: (input.history ?? []).slice(-20),
            plan,
            traces: traces.map((t) => ({ name: t.name, ok: t.ok, result: t.result })),
            writeSummaries: writes.map((w) => w.summary),
            assistMode,
          }).reply;
    }
  } catch {
    replyText = composeOrchestratorReply({
      question: input.question,
      history: (input.history ?? []).slice(-20),
      plan,
      traces: traces.map((t) => ({ name: t.name, ok: t.ok, result: t.result })),
      writeSummaries: writes.map((w) => w.summary),
      assistMode,
    }).reply;
  }
  composeMs = Date.now() - composeStartedAt;
  actions = deterministic.actions;
  const demoBatchRequested =
    /demo|anteprim|propost[ae] visiv|siti? dimostrativ/i.test(input.question) &&
    writes.some((write) => write.tool === 'prepare_campaign');
  if (demoBatchRequested && deterministic.reply) {
    replyText = deterministic.reply;
  }
  if (
    deterministic.reply &&
    (deterministic.actions.some((action) => action.type === 'open_page') ||
      /bozza|cosa (?:hai|ha) scritt|cosa scrive|testo (?:della )?risposta/i.test(input.question))
  ) {
    replyText = deterministic.reply;
  }
  // Preferisci il testo grounded quando la reply AI non riporta i numeri/dati tool
  const groundedCalendar = traces.some((t) => t.ok && t.name === 'get_calendar_summary');
  if (groundedCalendar && deterministic.reply && !/\b\d+\s+appuntament/i.test(replyText)) {
    replyText = deterministic.reply;
  }
  const groundedProblems = traces.some((t) => t.ok && t.name === 'get_blockers');
  const askedWhyBlocked = /perch|blocc|non parte|non funziona/.test(input.question.toLowerCase());
  const askedPriority = /da dove|partirest/.test(input.question.toLowerCase());
  if (groundedProblems && deterministic.reply && askedWhyBlocked && !askedPriority) {
    replyText = deterministic.reply;
  }
  if (
    !demoBatchRequested &&
    writes.length &&
    !replyText.includes(writes[0]?.summary.slice(0, 24) ?? '___never___')
  ) {
    if (writes[0]?.summary) replyText = `${writes[0].summary} ${replyText}`.trim();
  }
  if (
    writes.some((w) => w.tool === 'create_campaign' || w.tool === 'prepare_campaign') &&
    !/0 messaggi inviati/i.test(replyText)
  ) {
    replyText = `${replyText} 0 messaggi inviati.`.trim();
  }
  if (!replyText.trim()) replyText = deterministic.reply;
  assertNoSecrets(replyText);
  const nextRefs = mergeEntityRefs(prevRefs, composeTraces, writes);

  const cap = config.budgetsUsd.operatorRequest;
  const estimated = estimateCostUsd(usage, resolveModel('answer_operator', env).tier, env);
  const overBudget = estimated > cap;
  if (overBudget) {
    replyText = `${replyText} Ho raggiunto il tetto di costo di questa richiesta.`;
  }

  const run = await input.persist({
    workspaceId: input.workspaceId,
    provider: config.mode,
    model: modelName,
    taskType: 'answer_operator',
    usage,
    estimatedCostUsd: Math.min(estimated, cap),
    latencyMs: Date.now() - turnStartedAt,
    status: aiUnavailable ? 'error' : 'ok',
    requestId,
    meta: {
      source: 'operator_orchestrator',
      promptVersion: OPERATOR_ORCHESTRATOR_PROMPT_VERSION,
      tools: traces.map((t) => t.name),
      writes: writes.map((w) => w.tool),
      safetyClass: plan.safetyClass,
      budgetCapUsd: cap,
      latency: {
        planningMs,
        toolsMs,
        writesMs,
        composeMs,
        fastPath: deterministicWriteFastPath,
      },
      operationTimings: writes
        .map((write) => ({
          tool: write.tool,
          campaignCreateMs:
            typeof write.data.campaignCreateMs === 'number'
              ? write.data.campaignCreateMs
              : undefined,
          enqueueMs: typeof write.data.enqueueMs === 'number' ? write.data.enqueueMs : undefined,
        }))
        .filter((timing) => timing.campaignCreateMs != null || timing.enqueueMs != null),
    },
  });

  yield { type: 'delta', text: replyText };
  yield {
    type: 'done',
    reply: replyText,
    actions,
    run,
    persisted: Boolean(run),
    refs: nextRefs,
  };
}

export async function collectOperatorTurn(input: OperatorTurnInput): Promise<{
  reply: string;
  actions: OperatorAction[];
  run: AiRunPublic | null;
  events: OperatorStreamEvent[];
  refs: OperatorEntityRefs;
}> {
  const events: OperatorStreamEvent[] = [];
  let reply = '';
  let actions: OperatorAction[] = [];
  let run: AiRunPublic | null = null;
  let refs = input.refs ?? emptyEntityRefs();
  for await (const event of runOperatorTurn(input)) {
    events.push(event);
    if (event.type === 'delta') reply += event.text;
    if (event.type === 'done') {
      reply = event.reply;
      actions = event.actions;
      run = event.run;
      refs = event.refs;
    }
  }
  return { reply, actions, run, events, refs };
}
