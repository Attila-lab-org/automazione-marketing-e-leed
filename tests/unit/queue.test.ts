import { describe, expect, it } from 'vitest';

import {
  buildIdempotencyKey,
  InMemoryJobQueue,
} from '../../src/lib/jobs/queue';

function setupQueue(now: () => Date = () => new Date()) {
  return new InMemoryJobQueue({ now, backoffBaseSeconds: 60 });
}

const baseEnqueue = {
  workspaceId: 'ws-1',
  jobType: 'SEND_MESSAGE' as const,
  entityType: 'campaign_lead',
  entityId: 'cl-1',
};

describe('InMemoryJobQueue (§15.1)', () => {
  it('enqueue con stessa idempotency_key → no-op deduplicato', async () => {
    const q = setupQueue();
    const key = buildIdempotencyKey('SEND_MESSAGE', 'campaign_lead', 'cl-1', 'step:1');
    const first = await q.enqueue({ ...baseEnqueue, idempotencyKey: key });
    const second = await q.enqueue({ ...baseEnqueue, idempotencyKey: key });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.job.id).toBe(first.job.id);
  });

  it('enqueueMany inserisce il batch e deduplica per idempotency key', async () => {
    const q = setupQueue();
    const inputs = [
      { ...baseEnqueue, entityId: 'cl-1', idempotencyKey: 'batch-1' },
      { ...baseEnqueue, entityId: 'cl-2', idempotencyKey: 'batch-2' },
    ];
    expect(await q.enqueueMany(inputs)).toMatchObject({ inserted: 2, deduplicated: 0 });
    expect(await q.enqueueMany(inputs)).toMatchObject({ inserted: 0, deduplicated: 2 });
  });

  it('claim assegna lease e impedisce doppio claim concorrente', async () => {
    const q = setupQueue();
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'k1' });
    const claimed = await q.claim({ workerId: 'w1', leaseSeconds: 60 });
    expect(claimed).not.toBeNull();
    expect(claimed?.status).toBe('RUNNING');
    expect(claimed?.leaseOwner).toBe('w1');
    expect(claimed?.attemptCount).toBe(1);
    // secondo claim: lease attivo → nessun job
    expect(await q.claim({ workerId: 'w2' })).toBeNull();
  });

  it('lease scaduto → recoverStuckJobs lo rende ri-clamabile da altro worker (recovery §10.4)', async () => {
    let now = new Date('2025-01-01T00:00:00Z');
    const q = setupQueue(() => now);
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'k1' });
    await q.claim({ workerId: 'w1', leaseSeconds: 60 });
    now = new Date(now.getTime() + 120_000); // +2 minuti, lease scaduto
    const recovered = await q.recoverStuckJobs();
    expect(recovered).toBe(1);
    now = new Date(now.getTime() + 61_000); // oltre il backoff schedulato
    const reclaimed = await q.claim({ workerId: 'w2' });
    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.leaseOwner).toBe('w2');
    expect(reclaimed?.attemptCount).toBe(2);
    expect(reclaimed?.errorCode).toBe('LEASE_EXPIRED');
  });

  it('recoverStuckJobs porta a FAILED i job a max_attempts', async () => {
    let now = new Date('2025-01-01T00:00:00Z');
    const q = setupQueue(() => now);
    const { job } = await q.enqueue({ ...baseEnqueue, idempotencyKey: 'k1', maxAttempts: 1 });
    await q.claim({ workerId: 'w1', leaseSeconds: 60 }); // attemptCount = 1 = max
    now = new Date(now.getTime() + 120_000);
    await q.recoverStuckJobs();
    const recovered = await q.getById(job.id);
    expect(recovered?.status).toBe('FAILED');
    expect(recovered?.errorCode).toBe('LEASE_EXPIRED');
  });

  it('fail con retry/backoff: RETRYING fino a max_attempts, poi FAILED', async () => {
    let now = new Date('2025-01-01T00:00:00Z');
    const q = setupQueue(() => now);
    const { job } = await q.enqueue({ ...baseEnqueue, idempotencyKey: 'k1', maxAttempts: 2 });

    await q.claim({ workerId: 'w1' });
    const failed1 = await q.fail(job.id, { errorCode: 'PROVIDER_TIMEOUT' });
    expect(failed1.status).toBe('RETRYING');
    // backoff: base 60s * 2^(attempt-1) = 60s dopo attempt 1
    expect(new Date(failed1.nextRetryAt!).getTime() - now.getTime()).toBe(60_000);

    now = new Date(now.getTime() + 61_000);
    await q.claim({ workerId: 'w1' });
    const failed2 = await q.fail(job.id, { errorCode: 'PROVIDER_TIMEOUT' });
    expect(failed2.status).toBe('FAILED');
    expect(failed2.nextRetryAt).toBeNull();
    expect(failed2.errorCode).toBe('PROVIDER_TIMEOUT');
  });

  it('next_retry_at impedisce il claim anticipato', async () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const q = setupQueue(() => now);
    const { job } = await q.enqueue({ ...baseEnqueue, idempotencyKey: 'k1' });
    await q.claim({ workerId: 'w1' });
    await q.fail(job.id, { errorCode: 'X' });
    // ora corrente < next_retry_at → non claimable
    expect(await q.claim({ workerId: 'w2' })).toBeNull();
  });

  it('dependency graph: job non claimable finché la dipendenza non è SUCCEEDED (§10.1)', async () => {
    const q = setupQueue();
    const parent = await q.enqueue({ ...baseEnqueue, idempotencyKey: 'parent', jobType: 'SCREENSHOT_DESKTOP', entityType: 'demo_site', entityId: 'demo-1' });
    const child = await q.enqueue({
      ...baseEnqueue,
      idempotencyKey: 'child',
      jobType: 'SEND_MESSAGE',
      dependsOnJobId: parent.job.id,
    });
    // il child non è claimable
    const claimed = await q.claim({ workerId: 'w1', jobTypes: ['SEND_MESSAGE'] });
    expect(claimed).toBeNull();
    // completo il parent
    const p = await q.claim({ workerId: 'w1' });
    expect(p?.id).toBe(parent.job.id);
    await q.complete(parent.job.id, { ok: true });
    // ora il child è claimable
    const claimedChild = await q.claim({ workerId: 'w1', jobTypes: ['SEND_MESSAGE'] });
    expect(claimedChild?.id).toBe(child.job.id);
  });

  it('cancelPendingByEntity cancella atomicamente i follow-up pendenti (§12.2)', async () => {
    const q = setupQueue();
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'f1', jobType: 'FOLLOWUP_STEP' });
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'f2', jobType: 'FOLLOWUP_STEP' });
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'other', entityId: 'cl-2' });
    const cancelled = await q.cancelPendingByEntity('campaign_lead', 'cl-1', 'reply ricevuta');
    expect(cancelled).toBe(2);
    expect(await q.claim({ workerId: 'w1', jobTypes: ['FOLLOWUP_STEP'] })).toBeNull();
    // il job sull'altra entità resta claimable
    const other = await q.claim({ workerId: 'w1' });
    expect(other?.entityId).toBe('cl-2');
  });

  it('priorità: numero più basso claimato prima', async () => {
    const q = setupQueue();
    await q.enqueue({ ...baseEnqueue, idempotencyKey: 'low', priority: 200 });
    const high = await q.enqueue({ ...baseEnqueue, idempotencyKey: 'high', priority: 10 });
    const claimed = await q.claim({ workerId: 'w1' });
    expect(claimed?.id).toBe(high.job.id);
  });
});
