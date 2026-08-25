import type { Json } from '@/lib/types/database';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { AiRunInsertInput, AiRunPublic, AiRunStatus } from './types';
import { previewText } from './structured';

export type PersistAiRun = (input: AiRunInsertInput) => Promise<AiRunPublic | null>;

function asStatus(value: string): AiRunStatus {
  if (value === 'ok' || value === 'error' || value === 'timeout' || value === 'invalid_output') {
    return value;
  }
  return 'error';
}

export function toPublicRun(row: {
  id: string;
  model: string;
  task_type: string;
  provider: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: string;
  created_at: string;
}): AiRunPublic {
  return {
    id: row.id,
    model: row.model,
    taskType: row.task_type,
    provider: row.provider,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    latencyMs: row.latency_ms,
    status: asStatus(row.status),
    createdAt: row.created_at,
  };
}

export function createSupabaseAiRunStore(admin: AppSupabaseClient): PersistAiRun {
  return async (input) => {
    const { data, error } = await admin
      .from('ai_runs')
      .insert({
        workspace_id: input.workspaceId,
        provider: input.provider,
        model: input.model,
        task_type: input.taskType,
        lead_id: input.leadId ?? null,
        campaign_id: input.campaignId ?? null,
        thread_id: input.threadId ?? null,
        input_tokens: input.usage.inputTokens,
        cached_input_tokens: input.usage.cachedInputTokens,
        output_tokens: input.usage.outputTokens,
        estimated_cost_usd: input.estimatedCostUsd,
        latency_ms: input.latencyMs,
        status: input.status,
        error_message: input.errorMessage ? previewText(input.errorMessage, 400) : null,
        request_id: input.requestId ?? null,
        meta: JSON.parse(JSON.stringify(input.meta ?? {})) as Json,
      })
      .select(
        'id, model, task_type, provider, input_tokens, cached_input_tokens, output_tokens, estimated_cost_usd, latency_ms, status, created_at',
      )
      .single();

    if (error) {
      console.error('ai_runs insert failed:', error.message);
      return null;
    }
    return toPublicRun(data);
  };
}

export async function listRecentAiRuns(
  admin: AppSupabaseClient,
  workspaceId: string,
  limit = 5,
): Promise<AiRunPublic[]> {
  const { data, error } = await admin
    .from('ai_runs')
    .select(
      'id, model, task_type, provider, input_tokens, cached_input_tokens, output_tokens, estimated_cost_usd, latency_ms, status, created_at',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('ai_runs list failed:', error.message);
    return [];
  }
  return (data ?? []).map(toPublicRun);
}
