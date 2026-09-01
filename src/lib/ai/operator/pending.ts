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

export function resolvePendingReuse(
  existing: { status: string; expires_at: string } | null,
  now = new Date(),
): 'reuse' | 'reset' | 'insert' {
  if (!existing) return 'insert';
  if (existing.status === 'pending' && new Date(existing.expires_at) > now) return 'reuse';
  return 'reset';
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505' || /pending_ai_actions_idempotency_idx/i.test(error?.message ?? '');
}

function toPending(row: {
  id: string;
  tool: string;
  params: unknown;
  payload_hash: string;
  target_summary: unknown;
  status: string;
  expires_at: string;
}): PendingAction {
  return {
    id: row.id,
    tool: row.tool,
    params: (row.params ?? {}) as Record<string, unknown>,
    payloadHash: row.payload_hash,
    targetSummary: (row.target_summary ?? {}) as Record<string, unknown>,
    status: row.status as PendingActionStatus,
    expiresAt: row.expires_at,
  };
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

  const loadExisting = async () => {
    const { data } = await admin
      .from('pending_ai_actions')
      .select('id, tool, params, payload_hash, target_summary, status, expires_at')
      .eq('workspace_id', args.workspaceId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    return data;
  };

  const resetExisting = async (id: string): Promise<PendingAction> => {
    const { data, error } = await admin
      .from('pending_ai_actions')
      .update({
        status: 'pending',
        params: args.params as Json,
        payload_hash: payloadHash,
        target_summary: args.targetSummary as Json,
        expires_at: expiresAt,
        result: null,
        confirmed_at: null,
        executed_at: null,
      })
      .eq('workspace_id', args.workspaceId)
      .eq('id', id)
      .select('id, tool, params, payload_hash, target_summary, status, expires_at')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Pending action non aggiornata');
    return toPending(data);
  };

  const existing = await loadExisting();
  const decision = resolvePendingReuse(existing);
  if (decision === 'reuse' && existing) return toPending(existing);
  if (decision === 'reset' && existing) return resetExisting(existing.id);

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
  if (isUniqueViolation(error)) {
    const raced = await loadExisting();
    if (!raced) throw new Error(error?.message ?? 'Pending action non creata');
    return resolvePendingReuse(raced) === 'reuse' ? toPending(raced) : resetExisting(raced.id);
  }
  if (error || !data) throw new Error(error?.message ?? 'Pending action non creata');
  return toPending(data);
}

export async function getPendingAction(
  admin: AppSupabaseClient,
  workspaceId: string,
  id: string,
) {
  const { data, error } = await admin
    .from('pending_ai_actions')
    .select(
      'id, tool, params, payload_hash, target_summary, status, expires_at, result, executed_at, confirmed_at',
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

/** Claim atomico: solo uno dei click paralleli passa da pending → confirmed. */
export async function claimPendingForExecution(
  admin: AppSupabaseClient,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('pending_ai_actions')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export { hashPayload };
