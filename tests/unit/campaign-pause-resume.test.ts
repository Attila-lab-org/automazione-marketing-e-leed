import { describe, expect, it } from 'vitest';
import { InMemoryJobQueue } from '../../src/lib/jobs/queue';
import { PAUSE_RETRY_MS, SendDeferredError } from '../../src/lib/send-guard/defer';

/**
 * Campaign PAUSED = temporary wait.
 * FOLLOWUP_STEP due during pause must be deferred (not completed/skipped).
 * Resume releases jobs; repeated pause/resume must not create duplicate SEND.
 */
describe('Campaign pause/resume — FOLLOWUP defer', () => {
  it('pause followup → defer (no attempt burn, status QUEUED)', async () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const q = new InMemoryJobQueue({ now: () => now });
    await q.enqueue({
      workspaceId: 'w',
      jobType: 'FOLLOWUP_STEP',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: 'FOLLOWUP_STEP:cl1:3',
      inputSnapshot: { sequenceStep: 3 },
    });

    const claimed = await q.claim({ workerId: 'w1', now });
    expect(claimed?.attemptCount).toBe(1);

    const deferErr = new SendDeferredError({
      kind: 'defer',
      reason: 'CAMPAIGN_PAUSED',
      notBefore: new Date(now.getTime() + PAUSE_RETRY_MS),
      detail: 'Campaign PAUSED: defer FOLLOWUP_STEP fino a Resume',
    });

    await q.defer(claimed!.id, {
      notBefore: deferErr.defer.notBefore,
      reason: `${deferErr.defer.reason}: ${deferErr.defer.detail}`,
      workerId: 'w1',
      now,
    });

    const deferred = await q.getById(claimed!.id);
    expect(deferred?.status).toBe('QUEUED');
    expect(deferred?.attemptCount).toBe(0);
    expect(deferred?.errorCode).toBe('DEFERRED');
    expect(deferred?.errorDetail).toContain('CAMPAIGN_PAUSED');
  });

  it('resume → job processabile di nuovo (claim dopo notBefore)', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const q = new InMemoryJobQueue({ now: () => t0 });
    await q.enqueue({
      workspaceId: 'w',
      jobType: 'FOLLOWUP_STEP',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: 'FOLLOWUP_STEP:cl1:3',
    });

    const claimed = await q.claim({ workerId: 'w1', now: t0 });
    const resumeAt = new Date(t0.getTime() + 120_000);
    await q.defer(claimed!.id, {
      notBefore: resumeAt,
      reason: 'CAMPAIGN_PAUSED: pause',
      workerId: 'w1',
      now: t0,
    });

    // Too early while still paused
    expect(await q.claim({ workerId: 'w1', now: new Date(t0.getTime() + 60_000) })).toBeNull();

    // After resume window / released notBefore → processable
    const again = await q.claim({ workerId: 'w1', now: resumeAt });
    expect(again?.id).toBe(claimed!.id);
    expect(again?.attemptCount).toBe(1);

    await q.complete(again!.id, { enqueuedSend: true, sequenceStep: 3 }, 'w1');
    const done = await q.getById(again!.id);
    expect(done?.status).toBe('SUCCEEDED');
  });

  it('pause/resume ripetuti → nessun duplicate SEND (idempotency key unica)', async () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const q = new InMemoryJobQueue({ now: () => now });
    const sendKey = 'SEND_MESSAGE:campaign_lead:cl1:step:3';

    const first = await q.enqueue({
      workspaceId: 'w',
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: sendKey,
      inputSnapshot: { sequenceStep: 3 },
    });

    const second = await q.enqueue({
      workspaceId: 'w',
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: sendKey,
      inputSnapshot: { sequenceStep: 3 },
    });

    expect(second.job.id).toBe(first.job.id);
    expect(second.deduplicated).toBe(true);

    const claimed = await q.claim({ workerId: 'w1', now });
    await q.defer(claimed!.id, {
      notBefore: new Date(now.getTime() + PAUSE_RETRY_MS),
      reason: 'CAMPAIGN_PAUSED',
      workerId: 'w1',
      now,
    });

    const third = await q.enqueue({
      workspaceId: 'w',
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: sendKey,
    });
    expect(third.job.id).toBe(first.job.id);

    const later = new Date(now.getTime() + PAUSE_RETRY_MS);
    const sendJob = await q.claim({ workerId: 'w1', now: later });
    expect(sendJob?.id).toBe(first.job.id);
    await q.complete(sendJob!.id, { sent: true }, 'w1');

    const dup = await q.enqueue({
      workspaceId: 'w',
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: sendKey,
    });
    expect(dup.job.status).toBe('SUCCEEDED');
    expect(await q.claim({ workerId: 'w1', now: later })).toBeNull();
  });
});
