import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnqueueJobInput, JobQueue } from '@/lib/jobs/queue';
import type { AutomationJob, JobType } from '@/lib/types/domain';

function mapRow(row: Record<string, unknown>): AutomationJob {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    jobType: row.job_type as AutomationJob['jobType'],
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    status: row.status as AutomationJob['status'],
    priority: Number(row.priority),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    nextRetryAt: (row.next_retry_at as string | null) ?? null,
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: (row.lease_expires_at as string | null) ?? null,
    idempotencyKey: String(row.idempotency_key),
    inputSnapshot: (row.input_snapshot as Record<string, unknown>) ?? {},
    result: (row.result as Record<string, unknown> | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorDetail: (row.error_detail as string | null) ?? null,
    dependsOnJobId: (row.depends_on_job_id as string | null) ?? null,
    createdAt: String(row.created_at),
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
  };
}

/** Job queue backed by Supabase automation_jobs + claim_job RPC. */
export class SupabaseJobQueue implements JobQueue {
  constructor(private readonly admin: SupabaseClient) {}

  async enqueue(input: EnqueueJobInput): Promise<{ job: AutomationJob; deduplicated: boolean }> {
    const { data: existing } = await this.admin
      .from('automation_jobs')
      .select('*')
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    if (existing) return { job: mapRow(existing as Record<string, unknown>), deduplicated: true };

    const { data, error } = await this.admin
      .from('automation_jobs')
      .insert({
        workspace_id: input.workspaceId,
        job_type: input.jobType,
        entity_type: input.entityType,
        entity_id: input.entityId,
        idempotency_key: input.idempotencyKey,
        priority: input.priority ?? 100,
        max_attempts: input.maxAttempts ?? 5,
        input_snapshot: input.inputSnapshot ?? {},
        depends_on_job_id: input.dependsOnJobId ?? null,
        next_retry_at: input.notBefore?.toISOString() ?? null,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(`Job enqueue fallito — ${error?.message ?? ''}`);
    return { job: mapRow(data as Record<string, unknown>), deduplicated: false };
  }

  async claim(options: {
    workerId: string;
    jobTypes?: readonly JobType[];
    workspaceId?: string;
    leaseSeconds?: number;
  }): Promise<AutomationJob | null> {
    const { data, error } = await this.admin.rpc('claim_job', {
      p_worker_id: options.workerId,
      p_job_types: options.jobTypes ?? null,
      p_lease_seconds: options.leaseSeconds ?? 300,
      p_workspace_id: options.workspaceId ?? null,
    });
    if (error) throw new Error(`Job claim fallito — ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return mapRow(row as Record<string, unknown>);
  }

  async complete(jobId: string, result: Record<string, unknown>): Promise<AutomationJob> {
    const { data, error } = await this.admin
      .from('automation_jobs')
      .update({
        status: 'SUCCEEDED',
        result,
        completed_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq('id', jobId)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Job complete fallito — ${error?.message ?? ''}`);
    return mapRow(data as Record<string, unknown>);
  }

  async fail(
    jobId: string,
    options: { errorCode: string; errorDetail?: string; workerId?: string },
  ): Promise<AutomationJob> {
    const { data: current } = await this.admin
      .from('automation_jobs')
      .select('attempt_count, max_attempts')
      .eq('id', jobId)
      .single();
    const attempts = Number(current?.attempt_count ?? 1);
    const max = Number(current?.max_attempts ?? 5);
    const terminal = attempts >= max;
    const nextRetry = terminal
      ? null
      : new Date(Date.now() + 60_000 * 2 ** attempts).toISOString();

    const { data, error } = await this.admin
      .from('automation_jobs')
      .update({
        status: terminal ? 'FAILED' : 'RETRYING',
        error_code: options.errorCode,
        error_detail: options.errorDetail ?? null,
        next_retry_at: nextRetry,
        lease_owner: null,
        lease_expires_at: null,
        completed_at: terminal ? new Date().toISOString() : null,
      })
      .eq('id', jobId)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Job fail fallito — ${error?.message ?? ''}`);
    return mapRow(data as Record<string, unknown>);
  }

  async cancel(jobId: string): Promise<AutomationJob> {
    const { data, error } = await this.admin
      .from('automation_jobs')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq('id', jobId)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Job cancel fallito — ${error?.message ?? ''}`);
    return mapRow(data as Record<string, unknown>);
  }

  async cancelPendingByEntity(entityType: string, entityId: string): Promise<number> {
    const { data, error } = await this.admin
      .from('automation_jobs')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
      })
      .in('status', ['QUEUED', 'RETRYING'])
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .select('id');
    if (error) throw new Error(`Job cancel entity fallito — ${error.message}`);
    return data?.length ?? 0;
  }

  async recoverStuckJobs(): Promise<number> {
    const { data, error } = await this.admin.rpc('recover_stuck_jobs', { p_backoff_base_seconds: 60 });
    if (error) throw new Error(`recover_stuck_jobs fallito — ${error.message}`);
    return Number(data ?? 0);
  }

  async getById(jobId: string): Promise<AutomationJob | null> {
    const { data } = await this.admin.from('automation_jobs').select('*').eq('id', jobId).maybeSingle();
    return data ? mapRow(data as Record<string, unknown>) : null;
  }
}
