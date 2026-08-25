import { describe, expect, it } from 'vitest';

import { runSendGuard, type SendGuardContext } from '../../src/lib/send-guard';
import type { PolicyEvaluation } from '../../src/lib/types/domain';

function autoEvaluation(decision: PolicyEvaluation['decision'] = 'AUTO'): PolicyEvaluation {
  return {
    action: 'send',
    gateMode: 'SCORE_THRESHOLD',
    decision,
    autoApproved: decision === 'AUTO',
    reasons: [],
    policyVersionId: 'pv-1',
    policyVersion: 1,
    evaluatedAt: new Date().toISOString(),
  };
}

function passingContext(overrides: Partial<SendGuardContext> = {}): SendGuardContext {
  return {
    recipient: { email: 'lead@example.com', emailValid: true, suppressed: false },
    lead: { businessStatus: 'CAMPAIGN_READY', hasBlockingReply: false },
    campaign: { status: 'ACTIVE', rateLimitAvailable: true, outreachPausedAll: false },
    policy: { evaluation: autoEvaluation('AUTO'), humanApproved: false },
    message: { subject: 'Ciao', body: 'Corpo del messaggio', status: 'READY' },
    demo: { required: false, demoReady: false, screenshotReady: false },
    idempotency: { alreadySent: false },
    ...overrides,
  };
}

describe('runSendGuard (§11.2 — 7 check)', () => {
  it('contesto valido → allowed=true, tutti i 7 check passano', () => {
    const result = runSendGuard(passingContext());
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.checks.map((c) => c.name)).toEqual([
      'recipient',
      'lead',
      'campaign',
      'policy',
      'message',
      'demo',
      'idempotency',
    ]);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('blocca destinatario in suppression_list', () => {
    const result = runSendGuard(
      passingContext({ recipient: { email: 'lead@example.com', emailValid: true, suppressed: true } }),
    );
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === 'recipient');
    expect(check?.passed).toBe(false);
    expect(check?.reasons.some((r) => r.includes('suppression'))).toBe(true);
  });

  it('blocca email assente o invalida', () => {
    for (const recipient of [
      { email: null, emailValid: false, suppressed: false },
      { email: 'lead@example.com', emailValid: false, suppressed: false },
    ]) {
      const result = runSendGuard(passingContext({ recipient }));
      expect(result.allowed).toBe(false);
      expect(result.checks.find((c) => c.name === 'recipient')?.passed).toBe(false);
    }
  });

  it('blocca su reply che interrompe il flusso', () => {
    const result = runSendGuard(
      passingContext({ lead: { businessStatus: 'REPLIED', hasBlockingReply: true } }),
    );
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === 'lead');
    expect(check?.passed).toBe(false);
    expect(check?.reasons.some((r) => r.includes('reply'))).toBe(true);
  });

  it('consente la risposta conversazionale ma mantiene suppression e kill switch', () => {
    const conversational = runSendGuard(
      passingContext({
        sendKind: 'CONVERSATION',
        lead: { businessStatus: 'REPLIED', hasBlockingReply: true },
        campaign: {
          status: 'PAUSED',
          rateLimitAvailable: true,
          outreachPausedAll: false,
          withinSendWindow: false,
        },
      }),
    );
    expect(conversational.allowed).toBe(true);

    const suppressed = runSendGuard(
      passingContext({
        sendKind: 'CONVERSATION',
        recipient: { email: 'lead@example.com', emailValid: true, suppressed: true },
        lead: { businessStatus: 'REPLIED', hasBlockingReply: true },
      }),
    );
    expect(suppressed.allowed).toBe(false);

    const paused = runSendGuard(
      passingContext({
        sendKind: 'CONVERSATION',
        lead: { businessStatus: 'REPLIED', hasBlockingReply: true },
        campaign: { status: 'ACTIVE', rateLimitAvailable: true, outreachPausedAll: true },
      }),
    );
    expect(paused.allowed).toBe(false);
  });

  it('blocca campaign paused e kill switch globale (§19.2)', () => {
    const paused = runSendGuard(
      passingContext({ campaign: { status: 'PAUSED', rateLimitAvailable: true, outreachPausedAll: false } }),
    );
    expect(paused.allowed).toBe(false);
    expect(paused.checks.find((c) => c.name === 'campaign')?.passed).toBe(false);

    const killSwitch = runSendGuard(
      passingContext({ campaign: { status: 'ACTIVE', rateLimitAvailable: true, outreachPausedAll: true } }),
    );
    expect(killSwitch.allowed).toBe(false);
    expect(
      killSwitch.checks.find((c) => c.name === 'campaign')?.reasons.some((r) => r.includes('PAUSE ALL')),
    ).toBe(true);
  });

  it('blocca se rate limit esaurito', () => {
    const result = runSendGuard(
      passingContext({ campaign: { status: 'ACTIVE', rateLimitAvailable: false, outreachPausedAll: false } }),
    );
    expect(result.allowed).toBe(false);
  });

  it('blocca senza policy snapshot', () => {
    const result = runSendGuard(passingContext({ policy: { evaluation: null, humanApproved: false } }));
    expect(result.allowed).toBe(false);
    expect(result.checks.find((c) => c.name === 'policy')?.passed).toBe(false);
  });

  it('gate REVIEW senza approvazione umana → bloccato; con approvazione → passa', () => {
    const review = autoEvaluation('REVIEW');
    const notApproved = runSendGuard(passingContext({ policy: { evaluation: review, humanApproved: false } }));
    expect(notApproved.allowed).toBe(false);

    const approved = runSendGuard(passingContext({ policy: { evaluation: review, humanApproved: true } }));
    expect(approved.checks.find((c) => c.name === 'policy')?.passed).toBe(true);
    expect(approved.allowed).toBe(true);
  });

  it('blocca message vuoto o non READY', () => {
    const empty = runSendGuard(
      passingContext({ message: { subject: '  ', body: 'x', status: 'READY' } }),
    );
    expect(empty.checks.find((c) => c.name === 'message')?.passed).toBe(false);

    const draft = runSendGuard(
      passingContext({ message: { subject: 's', body: 'b', status: 'DRAFT' } }),
    );
    expect(draft.checks.find((c) => c.name === 'message')?.passed).toBe(false);
  });

  it('blocca se demo richiesta ma screenshot non READY (§10.1)', () => {
    const result = runSendGuard(
      passingContext({ demo: { required: true, demoReady: true, screenshotReady: false } }),
    );
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === 'demo');
    expect(check?.passed).toBe(false);
    expect(check?.reasons.some((r) => r.includes('screenshot'))).toBe(true);
  });

  it('blocca duplicato campaign_lead + sequence_step (idempotency)', () => {
    const result = runSendGuard(passingContext({ idempotency: { alreadySent: true } }));
    expect(result.allowed).toBe(false);
    expect(result.checks.find((c) => c.name === 'idempotency')?.passed).toBe(false);
  });

  it('i blockers aggregano i motivi con il nome del check', () => {
    const result = runSendGuard(
      passingContext({
        recipient: { email: null, emailValid: false, suppressed: true },
        idempotency: { alreadySent: true },
      }),
    );
    expect(result.blockers.some((b) => b.startsWith('[recipient]'))).toBe(true);
    expect(result.blockers.some((b) => b.startsWith('[idempotency]'))).toBe(true);
  });
});
