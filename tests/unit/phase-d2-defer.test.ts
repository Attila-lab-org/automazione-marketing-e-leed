import { describe, expect, it } from 'vitest';
import { InMemoryJobQueue } from '../../src/lib/jobs/queue';
import { runSendGuard, type SendGuardContext } from '../../src/lib/send-guard';
import {
  classifySendGuardDisposition,
  nextSendWindowOpen,
} from '../../src/lib/send-guard/defer';
import type { PolicyEvaluation } from '../../src/lib/types/domain';

const policyEval: PolicyEvaluation = {
  decision: 'MANUAL',
  reasons: [],
  action: 'send',
  gateMode: 'MANUAL',
  autoApproved: false,
  policyVersionId: null,
  policyVersion: null,
  evaluatedAt: new Date().toISOString(),
};

function ctx(partial: Partial<SendGuardContext['campaign']> & { campaignStatus?: never } = {}): SendGuardContext {
  return {
    recipient: { email: 'a@b.it', emailValid: true, suppressed: false },
    lead: { businessStatus: 'CAMPAIGN_READY', hasBlockingReply: false },
    campaign: {
      status: 'ACTIVE',
      rateLimitAvailable: true,
      hourlyRateAvailable: true,
      dailyRateAvailable: true,
      withinSendWindow: true,
      sendWindow: { start: '09:00', end: '18:00', timezone: 'UTC' },
      outreachPausedAll: false,
      ...partial,
    },
    policy: { evaluation: policyEval, humanApproved: true },
    message: { subject: 'x', body: 'y', status: 'APPROVED' },
    demo: { required: true, demoReady: true, screenshotReady: true },
    idempotency: { alreadySent: false },
  };
}

describe('Phase D.2 — defer ≠ failure', () => {
  it('defer non consuma attempt budget e non FAILED', async () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const q = new InMemoryJobQueue({ now: () => now });
    await q.enqueue({
      workspaceId: 'w',
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: 'SEND:cl1:0',
    });
    const claimed = await q.claim({ workerId: 'w1', now });
    expect(claimed?.attemptCount).toBe(1);
    const deferred = await q.defer(claimed!.id, {
      notBefore: new Date('2026-01-01T11:00:00Z'),
      reason: 'HOURLY_RATE_LIMIT',
      workerId: 'w1',
      now,
    });
    expect(deferred.status).toBe('QUEUED');
    expect(deferred.attemptCount).toBe(0);
    expect(deferred.errorCode).toBe('DEFERRED');
    expect(deferred.nextRetryAt).toBe('2026-01-01T11:00:00.000Z');

    const tooEarly = await q.claim({ workerId: 'w1', now: new Date('2026-01-01T10:30:00Z') });
    expect(tooEarly).toBeNull();

    const later = await q.claim({ workerId: 'w1', now: new Date('2026-01-01T11:00:00Z') });
    expect(later?.id).toBe(claimed!.id);
    expect(later?.attemptCount).toBe(1);
  });

  it('50 send con limit 20/h → restanti deferred, nessuno FAILED', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const q = new InMemoryJobQueue({ now: () => t0 });
    for (let i = 0; i < 50; i += 1) {
      await q.enqueue({
        workspaceId: 'w',
        jobType: 'SEND_MESSAGE',
        entityType: 'campaign_lead',
        entityId: `cl${i}`,
        idempotencyKey: `SEND:cl${i}:0`,
      });
    }

    let completed = 0;
    let deferred = 0;
    for (let i = 0; i < 50; i += 1) {
      const job = await q.claim({ workerId: 'w1', now: t0 });
      if (!job) break;
      if (completed < 20) {
        await q.complete(job.id, { sent: true }, 'w1');
        completed += 1;
      } else {
        await q.defer(job.id, {
          notBefore: new Date('2026-01-01T11:00:00Z'),
          reason: 'HOURLY_RATE_LIMIT: slot pieno',
          workerId: 'w1',
          now: t0,
        });
        deferred += 1;
      }
    }

    expect(completed).toBe(20);
    expect(deferred).toBe(30);

    let failed = 0;
    let stillQueued = 0;
    for (let i = 0; i < 50; i += 1) {
      const job = await q.getById(
        (
          await q.enqueue({
            workspaceId: 'w',
            jobType: 'SEND_MESSAGE',
            entityType: 'campaign_lead',
            entityId: `cl${i}`,
            idempotencyKey: `SEND:cl${i}:0`,
          })
        ).job.id,
      );
      // get via dedupe
      if (job?.status === 'FAILED') failed += 1;
      if (job?.status === 'QUEUED' && job.errorCode === 'DEFERRED') stillQueued += 1;
      if (job?.status === 'SUCCEEDED') {
        /* ok */
      }
    }
    expect(failed).toBe(0);
    expect(stillQueued).toBe(30);

    // After hour slot, deferred jobs claimable again
    let reclaimable = 0;
    for (let i = 0; i < 30; i += 1) {
      const job = await q.claim({ workerId: 'w2', now: new Date('2026-01-01T11:00:00Z') });
      if (!job) break;
      reclaimable += 1;
      await q.complete(job.id, { sent: true }, 'w2');
    }
    expect(reclaimable).toBe(30);
  });

  it('campagna alle 20:00 con window 09–18 → defer fino a mattina, job vivo', () => {
    const evening = new Date('2026-01-01T20:00:00Z');
    const guardCtx = ctx({
      withinSendWindow: false,
      sendWindow: { start: '09:00', end: '18:00', timezone: 'UTC' },
    });
    const guard = runSendGuard(guardCtx, evening);
    expect(guard.allowed).toBe(false);
    const disposition = classifySendGuardDisposition(guardCtx, guard, evening);
    expect(disposition.kind).toBe('defer');
    if (disposition.kind !== 'defer') return;
    expect(disposition.reason).toBe('OUTSIDE_SEND_WINDOW');
    expect(disposition.notBefore.getTime()).toBeGreaterThan(evening.getTime());
    // Next open should be next morning window
    const open = nextSendWindowOpen(
      { start: '09:00', end: '18:00', timezone: 'UTC' },
      evening,
    );
    expect(open.getTime()).toBeGreaterThanOrEqual(disposition.notBefore.getTime() - 15 * 60 * 1000);
    expect(isWithinUtcWindow(open, '09:00', '18:00')).toBe(true);
  });

  it('pause e daily limit → defer, non block permanente', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const paused = classifySendGuardDisposition(
      ctx({ outreachPausedAll: true }),
      runSendGuard(ctx({ outreachPausedAll: true }), now),
      now,
    );
    expect(paused.kind).toBe('defer');
    if (paused.kind === 'defer') expect(paused.reason).toBe('OUTREACH_PAUSED');

    const daily = classifySendGuardDisposition(
      ctx({ dailyRateAvailable: false, rateLimitAvailable: false }),
      runSendGuard(ctx({ dailyRateAvailable: false, rateLimitAvailable: false }), now),
      now,
    );
    expect(daily.kind).toBe('defer');
    if (daily.kind === 'defer') expect(daily.reason).toBe('DAILY_SEND_LIMIT');
  });
});

function isWithinUtcWindow(d: Date, start: string, end: string): boolean {
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return mins >= (sh ?? 0) * 60 + (sm ?? 0) && mins <= (eh ?? 23) * 60 + (em ?? 59);
}
