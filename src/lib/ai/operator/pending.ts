import { createHash } from 'crypto';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';

export type PendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'executed' | 'expired';

export type PendingAction = {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  payloadHash: string;
  targetSummary: Record<string, unknown>;
  status: PendingActionStatus;
  expiresAt: string;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

function hashPayload(tool: string, params: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify({ tool, params: stable(params) }))
    .digest('hex');
}

export function pendingIdempotencyKey(
  tool: string,
  params: Record<string, unknown>,
): string {
  return `${tool}:${hashPayload(tool, params).slice(0, 24)}`;
}

export async function createPendingAction(
  admin: AppSupabaseClient,
  args: {
    workspaceId: string;
    tool: string;
    params: Record<string, unknown>;
    targetSummary: Record<string, unknown>;
    actor?: 'AI' | 'HUMAN' | 'SYSTEM';
    ttlMinutes?: number;
  },
): Promise<PendingAction> {
  const payloadHash = hashPayload(args.tool, args.params);
  const idempotencyKey = pendingIdempotencyKey(args.tool, args.params);
  const expiresAt = new Date(Date.now() + (args.ttlMinutes ?? 30) * 60_000).toISOString();

  const { data: existing } = await admin
    .from('pending_ai_actions')
    .select('id, tool, params, payload_hash, target_summary, status, expires_at')
    .eq('workspace_id', args.workspaceId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing && existing.status === 'pending' && new Date(existing.expires_at) > new Date()) {
    return {
      id: existing.id,
      tool: existing.tool,
      params: (existing.params ?? {}) as Record<string, unknown>,
      payloadHash: existing.payload_hash,
      targetSummary: (existing.target_summary ?? {}) as Record<string, unknown>,
      status: existing.status as PendingActionStatus,
      expiresAt: existing.expires_at,
    };
  }

  const { data, error } = await admin
    .from('pending_ai_actions')
    .insert({
      workspace_id: args.workspaceId,
      idempotency_key: idempotencyKey,
      actor: args.actor ?? 'AI',
      tool: args.tool,
      params: args.params as Json,
      payload_hash: payloadHash,
      target_summary: args.targetSummary as Json,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select('id, tool, params, payload_hash, target_summary, status, expires_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Pending action non creata');
  return {
    id: data.id,
    tool: data.tool,
    params: (data.params ?? {}) as Record<string, unknown>,
    payloadHash: data.payload_hash,
    targetSummary: (data.target_summary ?? {}) as Record<string, unknown>,
    status: data.status as PendingActionStatus,
    expiresAt: data.expires_at,
  };
}

export async function getPendingAction(
  admin: AppSupabaseClient,
  workspaceId: string,
  id: string,
) {
  const { data, error } = await admin
    .from('pending_ai_actions')
    .select(
      'id, tool, params, payload_hash, target_summary, status, expires_at, result',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function markPending(
  admin: AppSupabaseClient,
  workspaceId: string,
  id: string,
  patch: Partial<Pick<
    import('@/lib/types/database').PendingAiActionRow,
    'status' | 'confirmed_at' | 'executed_at' | 'result'
  >>,
) {
  const { error } = await admin
    .from('pending_ai_actions')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export { hashPayload };
