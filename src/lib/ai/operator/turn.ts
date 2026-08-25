import { estimateCostUsd, estimateTokensFromText } from '@/lib/ai/costs';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { resolveModel } from '@/lib/ai/router';
import type { PersistAiRun } from '@/lib/ai/persist';
import type { AiRunPublic } from '@/lib/ai/types';
import { assertNoSecrets } from '@/lib/ai/readiness';
import type { OperatorAction } from './actions';
import { composeOperatorReply } from './compose';
import type { OperatorEnvelope } from './envelope';
import { classifyOperatorIntent } from './intent';
import {
  executeOperatorTool,
  operatorTaskType,
  suggestOperatorTools,
  TOOL_LABELS,
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
    }
  | { type: 'error'; message: string };

export type OperatorWriteHooks = {
  prepare?: (input: {
    leads: LeadSearchHit[];
    campaignId: string | null;
  }) => Promise<WriteResult[]>;
  sendPending?: (campaignId: string) => Promise<WriteResult>;
  proposePolicy?: (question: string) => Promise<WriteResult>;
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
};

const MAX_TOOL_CALLS = 8;

export async function* runOperatorTurn(
  input: OperatorTurnInput,
): AsyncGenerator<OperatorStreamEvent> {
  yield { type: 'session', sessionId: input.sessionId };
  const env = input.env ?? process.env;
  const intent = classifyOperatorIntent(input.question);
  const planned = suggestOperatorTools(input.question, input.envelope).slice(0, MAX_TOOL_CALLS);
  const traces: Array<{ name: OperatorToolName; result: unknown }> = [];
  const writes: WriteResult[] = [];

  for (const call of planned) {
    const labels = TOOL_LABELS[call.name];
    yield { type: 'tool_start', name: call.name, label: labels.start };
    const executed = await executeOperatorTool(call.name, call.args, input.data, input.envelope);
    if (!executed.ok) {
      yield { type: 'tool_done', name: call.name, ok: false, label: executed.error };
      continue;
    }
    traces.push({ name: executed.name, result: executed.result });
    const count = Array.isArray(executed.result) ? executed.result.length : undefined;
    yield {
      type: 'tool_done',
      name: executed.name,
      ok: true,
      label: count != null ? `${labels.done} · ${count}` : labels.done,
      count,
    };
  }

  const detail = traces.find((t) => t.name === 'get_lead_detail')?.result as LeadSearchHit | null | undefined;
  const searched = (traces.find((t) => t.name === 'search_leads')?.result ?? []) as LeadSearchHit[];
  const leadHits = (detail ? [detail, ...searched] : searched).filter((row) => row && row.id);
  const campaignId =
    input.envelope.entityType === 'campaign' ? input.envelope.entityId ?? null : null;

  if (intent.kind === 'PREPARE' && input.writes?.prepare) {
    yield { type: 'tool_start', name: 'prepare_campaign', label: 'Sto preparando la campagna…' };
    const prepared = await input.writes.prepare({ leads: leadHits, campaignId });
    writes.push(...prepared);
    yield {
      type: 'tool_done',
      name: 'prepare_campaign',
      ok: prepared.every((w) => w.ok),
      label: prepared.map((w) => w.summary).join(' '),
    };
  }

  if (intent.kind === 'EXTERNAL') {
    const detail = traces.find((t) => t.name === 'get_campaign_detail')?.result as
      | { id?: string }
      | undefined;
    const targetId = campaignId ?? detail?.id;
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

  if (intent.kind === 'POLICY' && input.writes?.proposePolicy) {
    yield { type: 'tool_start', name: 'propose_autonomy', label: 'Sto preparando la policy…' };
    const proposed = await input.writes.proposePolicy(input.question);
    writes.push(proposed);
    yield { type: 'tool_done', name: 'propose_autonomy', ok: proposed.ok, label: proposed.summary };
  }

  const composed = composeOperatorReply(input.question, input.envelope, traces, writes);
  assertNoSecrets(composed);

  const taskType = operatorTaskType(input.question);
  const route = resolveModel(taskType, env);
  const usage = {
    inputTokens: estimateTokensFromText(input.question),
    cachedInputTokens: 0,
    outputTokens: estimateTokensFromText(composed.reply),
  };
  const estimated = estimateCostUsd(usage, route.tier, env);
  const cap = getAiCommercialConfig(env).budgetsUsd.operatorRequest;
  const run = await input.persist({
    workspaceId: input.workspaceId,
    provider: getAiCommercialConfig(env).mode,
    model: route.model,
    taskType,
    usage,
    estimatedCostUsd: estimated,
    latencyMs: 0,
    status: 'ok',
    meta: {
      source: 'operator_copilot',
      tools: traces.map((t) => t.name),
      writes: writes.map((w) => w.tool),
      intent: intent.kind,
      routeReason: route.reason,
      budgetCapUsd: cap,
    },
  });

  yield { type: 'delta', text: composed.reply };
  yield {
    type: 'done',
    reply: composed.reply,
    actions: composed.actions,
    run,
    persisted: Boolean(run),
  };
}

export async function collectOperatorTurn(input: OperatorTurnInput): Promise<{
  reply: string;
  actions: OperatorAction[];
  run: AiRunPublic | null;
  events: OperatorStreamEvent[];
}> {
  const events: OperatorStreamEvent[] = [];
  let reply = '';
  let actions: OperatorAction[] = [];
  let run: AiRunPublic | null = null;
  for await (const event of runOperatorTurn(input)) {
    events.push(event);
    if (event.type === 'delta') reply += event.text;
    if (event.type === 'done') {
      reply = event.reply;
      actions = event.actions;
      run = event.run;
    }
  }
  return { reply, actions, run, events };
}
