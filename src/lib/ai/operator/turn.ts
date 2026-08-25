import { estimateCostUsd } from '@/lib/ai/costs';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { resolveModel } from '@/lib/ai/router';
import type { PersistAiRun } from '@/lib/ai/persist';
import type { AiRunPublic } from '@/lib/ai/types';
import { estimateTokensFromText } from '@/lib/ai/costs';
import { assertNoSecrets } from '@/lib/ai/readiness';
import type { OperatorAction } from './actions';
import { composeOperatorReply } from './compose';
import type { OperatorEnvelope } from './envelope';
import {
  executeOperatorTool,
  operatorTaskType,
  suggestOperatorTools,
  TOOL_LABELS,
  type OperatorDataSource,
  type OperatorToolName,
} from './registry';

export type OperatorStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'tool_start'; name: OperatorToolName; label: string }
  | { type: 'tool_done'; name: OperatorToolName; ok: boolean; label: string; count?: number }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      reply: string;
      actions: OperatorAction[];
      run: AiRunPublic | null;
      persisted: boolean;
    }
  | { type: 'error'; message: string };

export type OperatorTurnInput = {
  workspaceId: string;
  sessionId: string;
  question: string;
  envelope: OperatorEnvelope;
  data: OperatorDataSource;
  persist: PersistAiRun;
  env?: NodeJS.ProcessEnv;
};

export async function* runOperatorTurn(
  input: OperatorTurnInput,
): AsyncGenerator<OperatorStreamEvent> {
  yield { type: 'session', sessionId: input.sessionId };
  const env = input.env ?? process.env;
  const planned = suggestOperatorTools(input.question, input.envelope);
  const traces: Array<{ name: OperatorToolName; result: unknown }> = [];

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

  const composed = composeOperatorReply(input.question, input.envelope, traces);
  assertNoSecrets(composed);

  const taskType = operatorTaskType(input.question);
  const route = resolveModel(taskType, env);
  const usage = {
    inputTokens: estimateTokensFromText(input.question),
    cachedInputTokens: 0,
    outputTokens: estimateTokensFromText(composed.reply),
  };
  const run = await input.persist({
    workspaceId: input.workspaceId,
    provider: getAiCommercialConfig(env).mode,
    model: route.model,
    taskType,
    usage,
    estimatedCostUsd: estimateCostUsd(usage, route.tier, env),
    latencyMs: 0,
    status: 'ok',
    meta: {
      source: 'operator_copilot',
      tools: traces.map((t) => t.name),
      routeReason: route.reason,
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
