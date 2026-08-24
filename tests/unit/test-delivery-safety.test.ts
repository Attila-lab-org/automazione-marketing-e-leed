import { describe, expect, it } from 'vitest';
import {
  BlockedTestRecipientError,
  parseTestRecipientAllowlist,
  resolveTestDelivery,
  testSequenceDelayMs,
} from '../../src/lib/campaigns/test-delivery';

describe('Safe Live Email Test Mode — delivery resolve', () => {
  const env = {
    RESEND_TEST_RECIPIENT_ALLOWLIST: 'test@attila-lab.net, other@example.com',
  } as unknown as NodeJS.ProcessEnv;

  it('Caso A: TEST + allowlisted → actual = test, intended = lead', () => {
    const r = resolveTestDelivery({
      deliveryMode: 'TEST',
      testRecipient: 'test@attila-lab.net',
      leadEmail: 'prospect@ristorante.it',
      env,
    });
    expect(r.actualDeliveryRecipient).toBe('test@attila-lab.net');
    expect(r.intendedRecipient).toBe('prospect@ristorante.it');
    expect(r.actualDeliveryRecipient).not.toBe(r.intendedRecipient);
  });

  it('Caso B: TEST + non allowlisted → BLOCK, zero Resend implied', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: 'hacker@evil.com',
        leadEmail: 'prospect@ristorante.it',
        env,
      }),
    ).toThrow(BlockedTestRecipientError);
    try {
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: 'hacker@evil.com',
        leadEmail: 'prospect@ristorante.it',
        env,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BlockedTestRecipientError);
      expect((e as BlockedTestRecipientError).code).toBe('BLOCKED_TEST_RECIPIENT');
      expect((e as Error).message).toContain('BLOCKED_TEST_RECIPIENT');
    }
  });

  it('Caso C: TEST + test recipient mancante → BLOCK', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: null,
        leadEmail: 'prospect@ristorante.it',
        env,
      }),
    ).toThrow(/test_recipient assente/);
  });

  it('Caso Cbis: allowlist vuota → BLOCK', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: 'test@attila-lab.net',
        leadEmail: 'prospect@ristorante.it',
        env: { RESEND_TEST_RECIPIENT_ALLOWLIST: '' } as unknown as NodeJS.ProcessEnv,
      }),
    ).toThrow(/ALLOWLIST/);
  });

  it('Caso D/E: stesso test recipient su resolve ripetuto (follow-up/retry)', () => {
    const a = resolveTestDelivery({
      deliveryMode: 'TEST',
      testRecipient: 'test@attila-lab.net',
      leadEmail: 'prospect@ristorante.it',
      env,
    });
    const b = resolveTestDelivery({
      deliveryMode: 'TEST',
      testRecipient: 'test@attila-lab.net',
      leadEmail: 'prospect@ristorante.it',
      env,
    });
    expect(a.actualDeliveryRecipient).toBe(b.actualDeliveryRecipient);
    expect(a.actualDeliveryRecipient).toBe('test@attila-lab.net');
  });

  it('Caso F: PRODUCTION → lead email, nessuna allowlist richiesta', () => {
    const r = resolveTestDelivery({
      deliveryMode: 'PRODUCTION',
      testRecipient: null,
      leadEmail: 'prospect@ristorante.it',
      env: {} as unknown as NodeJS.ProcessEnv,
    });
    expect(r.actualDeliveryRecipient).toBe('prospect@ristorante.it');
    expect(r.intendedRecipient).toBe('prospect@ristorante.it');
  });

  it('never falls back to lead when TEST misconfigured', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: '  ',
        leadEmail: 'prospect@ristorante.it',
        env,
      }),
    ).toThrow(BlockedTestRecipientError);
  });

  it('allowlist parse + TEST sequence delays', () => {
    expect(parseTestRecipientAllowlist(env)).toEqual([
      'test@attila-lab.net',
      'other@example.com',
    ]);
    expect(testSequenceDelayMs(1)).toBe(5 * 60 * 1000);
    expect(testSequenceDelayMs(2)).toBe(10 * 60 * 1000);
    expect(testSequenceDelayMs(0)).toBeNull();
  });
});
