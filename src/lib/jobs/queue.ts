/**
 * Job Queue — MASTER_SPEC §15.1, ARCHITECTURE §5.
 *
 * Interfaccia JobQueue stabile + implementazione in-memory per mock mode.
 * L'implementazione Supabase (claim_job SQL con FOR UPDATE SKIP LOCKED,
 * migration plan §10.3) la sostituirà senza cambiare il contratto.
 *
 * Proprietà:
 * - Idempotenza: idempotency_key UNIQUE; doppio enqueue → no-op con il job esistente.
 * - Lease: claim assegna lease_owner + lease_expires_at; lease scaduto → job ri-clamabile.
 * - Retry/backoff: fail incrementa attempt_count e schedula next_retry_at
 *   (backoff esponenziale) fino a max_attempts → FAILED definitivo.
 * - Dependency graph: claimable solo se depends_on_job_id è SUCCEEDED (§10.1).
 * - Cancellation: cancel atomico; cancelPendingByEntity per i follow-up (§12.2).
 */

import type { AutomationJob, JobStatus, JobType } from '../types/domain';

export interface EnqueueJobInput {
  workspaceId: string;
  jobType: JobType;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
  inputSnapshot?: Record<string, unknown>;
  dependsOnJobId?: string | null;
  /** Ritardo iniziale: il job non è claimable prima di questo istante. */
  notBefore?: Date;
}

export interface EnqueueResult {
  job: AutomationJob;
  /** true se esisteva già un job con la stessa idempotency_key (no-op). */
  deduplicated: boolean;
}

export interface EnqueueManyResult {
  inserted: number;
  deduplicated: number;
  jobs: AutomationJob[];
}

export interface ClaimOptions {
  workerId: string;
  jobTypes?: readonly JobType[];
  workspaceId?: string;
  leaseSeconds?: number;
  now?: Date;
}

export interface FailOptions {
  errorCode: string;
  errorDetail?: string;
  workerId?: string;
  now?: Date;
}

export interface DeferOptions {
  notBefore: Date;
  reason: string;
  workerId?: string;
  now?: Date;
}

export interface JobQueue {
  enqueue(input: EnqueueJobInput): Promise<EnqueueResult>;
  enqueueMany(inputs: readonly EnqueueJobInput[]): Promise<EnqueueManyResult>;
  claim(options: ClaimOptions): Promise<AutomationJob | null>;
  complete(jobId: string, result: Record<string, unknown>, workerId?: string): Promise<AutomationJob>;
  fail(jobId: string, options: FailOptions): Promise<AutomationJob>;
  /**
   * Commercial defer: job torna claimable dopo notBefore senza consumare
   * budget retry tecnici e senza passare a FAILED.
   */
  defer(jobId: string, options: DeferOptions): Promise<AutomationJob>;
  cancel(jobId: string, reason?: string): Promise<AutomationJob>;
  /** Cancel atomico dei job pendenti di un'entità (es. follow-up su reply §12.2). */
  cancelPendingByEntity(entityType: string, entityId: string, reason?: string): Promise<number>;
  /**
   * Recovery dei job RUNNING con lease scaduto (mirror di recover_stuck_jobs,
   * migration plan §10.4): → RETRYING con backoff oppure FAILED a max_attempts.
   * Ritorna il numero di job recuperati.
   */
  recoverStuckJobs(now?: Date): Promise<number>;
  getById(jobId: string): Promise<AutomationJob | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (mock mode)
// ---------------------------------------------------------------------------

export interface InMemoryJobQueueOptions {
  /** Base backoff in secondi (default 60): retry N → base * 2^attemptCount. */
  backoffBaseSeconds?: number;
  /** Orologio iniettabile per test deterministici. */
  now?: () => Date;
  /** Generatore id iniettabile per test deterministici. */
  idGenerator?: () => string;
}

const TERMINAL_STATUSES: readonly JobStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, AutomationJob>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly backoffBaseSeconds: number;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private counter = 0;

  constructor(options: InMemoryJobQueueOptions = {}) {
    this.backoffBaseSeconds = options.backoffBaseSeconds ?? 60;
    this.now = options.now ?? (() => new Date());
    this.idGenerator =
      options.idGenerator ??
      (() => {
        this.counter += 1;
        return `job-${this.counter.toString().padStart(6, '0')}`;
      });
  }

  async enqueue(input: EnqueueJobInput): Promise<EnqueueResult> {
    const existingId = this.idempotencyIndex.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) return { job: { ...existing }, deduplicated: true };
    }

    const job: AutomationJob = {
      id: this.idGenerator(),
      workspaceId: input.workspaceId,
      jobType: input.jobType,
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'QUEUED',
      priority: input.priority ?? 100,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextRetryAt: input.notBefore ? input.notBefore.toISOString() : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      idempotencyKey: input.idempotencyKey,
      inputSnapshot: input.inputSnapshot ?? {},
      result: null,
      errorCode: null,
      errorDetail: null,
      dependsOnJobId: input.dependsOnJobId ?? null,
      createdAt: this.now().toISOString(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    this.jobs.set(job.id, job);
    this.idempotencyIndex.set(job.idempotencyKey, job.id);
    return { job: { ...job }, deduplicated: false };
  }

  async enqueueMany(inputs: readonly EnqueueJobInput[]): Promise<EnqueueManyResult> {
    const jobs: AutomationJob[] = [];
    let inserted = 0;
    let deduplicated = 0;
    for (const input of inputs) {
      const result = await this.enqueue(input);
      jobs.push(result.job);
      if (result.deduplicated) deduplicated += 1;
      else inserted += 1;
    }
    return { inserted, deduplicated, jobs };
  }

  async claim(options: ClaimOptions): Promise<AutomationJob | null> {
    const now = options.now ?? this.now();
    const leaseSeconds = options.leaseSeconds ?? 300;

    const candidates = [...this.jobs.values()]
      .filter((job) => {
        if (job.status !== 'QUEUED' && job.status !== 'RETRYING') return false;
        if (job.nextRetryAt && new Date(job.nextRetryAt) > now) return false;
        if (job.leaseExpiresAt && new Date(job.leaseExpiresAt) > now) return false;
        if (options.jobTypes && !options.jobTypes.includes(job.jobType)) return false;
        if (options.workspaceId && job.workspaceId !== options.workspaceId) return false;
        if (job.dependsOnJobId) {
          const dep = this.jobs.get(job.dependsOnJobId);
          if (!dep || dep.status !== 'SUCCEEDED') return false;
        }
        return true;
      })
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

    const job = candidates[0];
    if (!job) return null;

    const claimed: AutomationJob = {
      ...job,
      status: 'RUNNING',
      leaseOwner: options.workerId,
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
      startedAt: job.startedAt ?? now.toISOString(),
      attemptCount: job.attemptCount + 1,
    };
    this.jobs.set(job.id, claimed);
    return { ...claimed };
  }

  async complete(jobId: string, result: Record<string, unknown>, workerId?: string): Promise<AutomationJob> {
    const job = this.requireJob(jobId);
    this.assertRunning(job, workerId);
    const updated: AutomationJob = {
      ...job,
      status: 'SUCCEEDED',
      result,
      errorCode: null,
      errorDetail: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: this.now().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  async fail(jobId: string, options: FailOptions): Promise<AutomationJob> {
    const job = this.requireJob(jobId);
    this.assertRunning(job, options.workerId);
    const now = options.now ?? this.now();

    const exhausted = job.attemptCount >= job.maxAttempts;
    const updated: AutomationJob = exhausted
      ? {
          ...job,
          status: 'FAILED',
          errorCode: options.errorCode,
          errorDetail: options.errorDetail ?? null,
          nextRetryAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now.toISOString(),
        }
      : {
          ...job,
          status: 'RETRYING',
          errorCode: options.errorCode,
          errorDetail: options.errorDetail ?? null,
          nextRetryAt: new Date(
            now.getTime() + this.backoffBaseSeconds * 2 ** (job.attemptCount - 1) * 1000,
          ).toISOString(),
          leaseOwner: null,
          leaseExpiresAt: null,
        };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  async defer(jobId: string, options: DeferOptions): Promise<AutomationJob> {
    const job = this.requireJob(jobId);
    this.assertRunning(job, options.workerId);
    const now = options.now ?? this.now();
    const notBefore =
      options.notBefore.getTime() > now.getTime()
        ? options.notBefore
        : new Date(now.getTime() + 60_000);
    // Undo claim attempt burn — commercial wait must not consume technical retries
    const restoredAttempts = Math.max(0, job.attemptCount - 1);
    const updated: AutomationJob = {
      ...job,
      status: 'QUEUED',
      attemptCount: restoredAttempts,
      errorCode: 'DEFERRED',
      errorDetail: options.reason,
      nextRetryAt: notBefore.toISOString(),
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: null,
      result: {
        deferred: true,
        reason: options.reason,
        notBefore: notBefore.toISOString(),
        deferredAt: now.toISOString(),
      },
    };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  async cancel(jobId: string, reason?: string): Promise<AutomationJob> {
    const job = this.requireJob(jobId);
    if (TERMINAL_STATUSES.includes(job.status)) {
      return { ...job }; // no-op su job terminale (cancel idempotente)
    }
    const updated: AutomationJob = {
      ...job,
      status: 'CANCELLED',
      errorDetail: reason ?? job.errorDetail,
      leaseOwner: null,
      leaseExpiresAt: null,
      cancelledAt: this.now().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  async cancelPendingByEntity(entityType: string, entityId: string, reason?: string): Promise<number> {
    let cancelled = 0;
    for (const job of [...this.jobs.values()]) {
      if (job.entityType !== entityType || job.entityId !== entityId) continue;
      if (TERMINAL_STATUSES.includes(job.status)) continue;
      await this.cancel(job.id, reason);
      cancelled += 1;
    }
    return cancelled;
  }

  async getById(jobId: string): Promise<AutomationJob | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async recoverStuckJobs(nowOverride?: Date): Promise<number> {
    const now = nowOverride ?? this.now();
    let recovered = 0;
    for (const job of [...this.jobs.values()]) {
      if (job.status !== 'RUNNING') continue;
      if (!job.leaseExpiresAt || new Date(job.leaseExpiresAt) > now) continue;
      const exhausted = job.attemptCount >= job.maxAttempts;
      const updated: AutomationJob = exhausted
        ? {
            ...job,
            status: 'FAILED',
            errorCode: job.errorCode ?? 'LEASE_EXPIRED',
            errorDetail:
              job.errorDetail ?? 'Lease scaduto senza completamento: job recuperato dallo scheduler',
            nextRetryAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            completedAt: now.toISOString(),
          }
        : {
            ...job,
            status: 'RETRYING',
            errorCode: job.errorCode ?? 'LEASE_EXPIRED',
            errorDetail:
              job.errorDetail ?? 'Lease scaduto senza completamento: job recuperato dallo scheduler',
            nextRetryAt: new Date(
              now.getTime() + this.backoffBaseSeconds * 2 ** (job.attemptCount - 1) * 1000,
            ).toISOString(),
            leaseOwner: null,
            leaseExpiresAt: null,
          };
      this.jobs.set(job.id, updated);
      recovered += 1;
    }
    return recovered;
  }

  private requireJob(jobId: string): AutomationJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" non trovato`);
    return job;
  }

  private assertRunning(job: AutomationJob, workerId?: string): void {
    if (job.status !== 'RUNNING') {
      throw new Error(`Job "${job.id}" non in stato RUNNING (status=${job.status})`);
    }
    if (workerId && job.leaseOwner && job.leaseOwner !== workerId) {
      throw new Error(`Job "${job.id}" posseduto da "${job.leaseOwner}", non da "${workerId}"`);
    }
  }
}

/** Helper: convenzione idempotency_key (migration plan §10.2). */
export function buildIdempotencyKey(
  jobType: JobType,
  entityType: string,
  entityId: string,
  scope: string,
): string {
  return `${jobType}:${entityType}:${entityId}:${scope}`;
}
