import { describe, expect, it } from 'vitest';

import {
  createPolicySnapshot,
  DEFAULT_WORKSPACE_POLICY,
  evaluatePolicyGate,
  resolvePolicy,
  validatePolicyConfig,
} from '../../src/lib/domain/policy';
import type { LeadScore, PolicySnapshot } from '../../src/lib/types/domain';

function scoreWith(overrides: Partial<LeadScore> = {}): LeadScore {
  return {
    algorithmVersion: 'scoring-v1.0',
    opportunityScore: 0,
    contactabilityScore: 0,
    dataConfidenceScore: 0,
    templateMatchScore: 0,
    businessPotentialScore: 0,
    totalScore: 0,
    confidence: 0,
    breakdown: {
      opportunity: { score: 0, weight: 0.3, signals: [] },
      contactability: { score: 0, weight: 0.2, signals: [] },
      data_confidence: { score: 0, weight: 0.2, signals: [] },
      template_match: { score: 0, weight: 0.1, signals: [] },
      business_potential: { score: 0, weight: 0.2, signals: [] },
    },
    reasons: [],
    ...overrides,
  };
}

/** Lead che soddisfa la regola §5.2: opp>=85, conf>=85, contactability>=80, valid email, status attivo. */
const GOLDEN = {
  score: scoreWith({ opportunityScore: 90, confidence: 90, contactabilityScore: 85 }),
  validEmail: true,
  businessStatus: 'CAMPAIGN_READY' as const,
};

function snapshotOf(config = DEFAULT_WORKSPACE_POLICY, options = {}): PolicySnapshot {
  return createPolicySnapshot(config, { policyVersionId: 'pv-1', campaignId: 'camp-1', version: 1, ...options });
}

describe('resolvePolicy (§4.1 override workspace → campaign/category)', () => {
  it('override campaign sovrascrive mode e gate senza mutare il workspace default', () => {
    const resolved = resolvePolicy(DEFAULT_WORKSPACE_POLICY, {
      mode: 'SCORE_BASED',
      actions: { send: 'SCORE_THRESHOLD' },
    });
    expect(resolved.mode).toBe('SCORE_BASED');
    expect(resolved.actions.send).toBe('SCORE_THRESHOLD');
    // default intatto
    expect(DEFAULT_WORKSPACE_POLICY.mode).toBe('MANUAL');
    expect(DEFAULT_WORKSPACE_POLICY.actions.send).toBe('MANUAL');
  });

  it('override category si applica sopra quello campaign', () => {
    const resolved = resolvePolicy(
      DEFAULT_WORKSPACE_POLICY,
      { actions: { send: 'SCORE_THRESHOLD' } },
      { actions: { send: 'MANUAL' } },
    );
    expect(resolved.actions.send).toBe('MANUAL');
  });

  it('override soglie parziali mantengono il resto', () => {
    const resolved = resolvePolicy(DEFAULT_WORKSPACE_POLICY, {
      thresholds: { minOpportunity: 90 },
    });
    expect(resolved.thresholds.minOpportunity).toBe(90);
    expect(resolved.thresholds.minConfidence).toBe(85);
  });
});

describe('createPolicySnapshot (§4.1 immutabilità)', () => {
  it('lo snapshot è deep-frozen: modifiche successive alla config non lo alterano', () => {
    const config = structuredClone(DEFAULT_WORKSPACE_POLICY);
    const snap = createPolicySnapshot(config, { now: new Date('2025-01-01T00:00:00Z') });
    expect(snap.capturedAt).toBe('2025-01-01T00:00:00.000Z');

    // modificare la config sorgente non deve cambiare lo snapshot
    config.mode = 'FULL_AUTO';
    config.actions.send = 'AUTO';
    expect(snap.config.mode).toBe('MANUAL');
    expect(snap.config.actions.send).toBe('MANUAL');

    // lo snapshot stesso è immutabile
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.config)).toBe(true);
    expect(Object.isFrozen(snap.config.thresholds)).toBe(true);
    expect(() => {
      (snap.config as { mode: string }).mode = 'FULL_AUTO';
    }).toThrow();
  });
});

describe('evaluatePolicyGate — send in SCORE_BASED (§5.2)', () => {
  const scoreBased = resolvePolicy(DEFAULT_WORKSPACE_POLICY, {
    mode: 'SCORE_BASED',
    actions: { send: 'SCORE_THRESHOLD' },
  });
  const snap = snapshotOf(scoreBased);

  it('soglie §5.2 tutte soddisfatte → AUTO (auto-send autorizzato)', () => {
    const result = evaluatePolicyGate(snap, { action: 'send', ...GOLDEN });
    expect(result.decision).toBe('AUTO');
    expect(result.autoApproved).toBe(true);
  });

  it('fascia intermedia → REVIEW (Review Queue §4)', () => {
    const result = evaluatePolicyGate(snap, {
      action: 'send',
      score: scoreWith({ opportunityScore: 70, confidence: 70, contactabilityScore: 65 }),
      validEmail: true,
      businessStatus: 'CAMPAIGN_READY',
    });
    expect(result.decision).toBe('REVIEW');
    expect(result.autoApproved).toBe(false);
  });

  it('sotto fascia review → BLOCKED', () => {
    const result = evaluatePolicyGate(snap, {
      action: 'send',
      score: scoreWith({ opportunityScore: 30, confidence: 20, contactabilityScore: 20 }),
      validEmail: false,
      businessStatus: 'NEW',
    });
    expect(result.decision).toBe('BLOCKED');
  });

  it.each([
    ['opportunity sotto soglia', { opportunityScore: 84 } ],
    ['confidence sotto soglia', { confidence: 84 }],
    ['contactability sotto soglia', { contactabilityScore: 79 }],
  ] as const)('%s → non AUTO', (_label, dim) => {
    const result = evaluatePolicyGate(snap, {
      action: 'send',
      ...GOLDEN,
      score: scoreWith({ opportunityScore: 90, confidence: 90, contactabilityScore: 85, ...dim }),
    });
    expect(result.decision).not.toBe('AUTO');
  });

  it('email non valida → non AUTO anche con score alti', () => {
    const result = evaluatePolicyGate(snap, { action: 'send', ...GOLDEN, validEmail: false });
    expect(result.decision).not.toBe('AUTO');
  });

  it('business_status non attivo (es. REPLIED) → non AUTO', () => {
    const result = evaluatePolicyGate(snap, { action: 'send', ...GOLDEN, businessStatus: 'REPLIED' });
    expect(result.decision).not.toBe('AUTO');
  });

  it('score mancante → non AUTO', () => {
    const result = evaluatePolicyGate(snap, { action: 'send', score: null, validEmail: true, businessStatus: 'CAMPAIGN_READY' });
    expect(result.decision).not.toBe('AUTO');
  });
});

describe('evaluatePolicyGate — altre modalità', () => {
  it('MANUAL → decision MANUAL (approvazione umana richiesta)', () => {
    const result = evaluatePolicyGate(snapshotOf(), { action: 'send', ...GOLDEN });
    expect(result.decision).toBe('MANUAL');
    expect(result.autoApproved).toBe(false);
  });

  it('FULL_AUTO con send=AUTO → AUTO', () => {
    const fullAuto = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { mode: 'FULL_AUTO', actions: { send: 'AUTO' } });
    const result = evaluatePolicyGate(snapshotOf(fullAuto), { action: 'send', ...GOLDEN });
    expect(result.decision).toBe('AUTO');
  });

  it('FULL_AUTO converte SCORE_THRESHOLD in AUTO', () => {
    const fullAuto = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { mode: 'FULL_AUTO', actions: { send: 'SCORE_THRESHOLD' } });
    const result = evaluatePolicyGate(snapshotOf(fullAuto), {
      action: 'send',
      score: scoreWith({ opportunityScore: 10, confidence: 10, contactabilityScore: 10 }),
      validEmail: false,
      businessStatus: 'NEW',
    });
    expect(result.decision).toBe('AUTO');
  });

  it('FULL_AUTO non invia mai a lead SUPPRESSED (safe-by-default)', () => {
    const fullAuto = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { mode: 'FULL_AUTO', actions: { send: 'AUTO' } });
    const result = evaluatePolicyGate(snapshotOf(fullAuto), { action: 'send', ...GOLDEN, businessStatus: 'SUPPRESSED' });
    expect(result.decision).toBe('BLOCKED');
  });

  it('followup OFF → BLOCKED', () => {
    const cfg = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { actions: { followup: 'OFF' } });
    const result = evaluatePolicyGate(snapshotOf(cfg), { action: 'followup', ...GOLDEN });
    expect(result.decision).toBe('BLOCKED');
  });

  it('la valutazione riporta policy version per il Decision Trace (§19.1)', () => {
    const result = evaluatePolicyGate(snapshotOf(), { action: 'send', ...GOLDEN });
    expect(result.policyVersionId).toBe('pv-1');
    expect(result.policyVersion).toBe(1);
  });
});

describe('validatePolicyConfig', () => {
  it('default workspace policy è valida', () => {
    expect(validatePolicyConfig(DEFAULT_WORKSPACE_POLICY)).toEqual([]);
  });

  it('rilevia gate non ammesso (es. send=OFF)', () => {
    const bad = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { actions: { send: 'OFF' } });
    expect(validatePolicyConfig(bad).some((e) => e.includes('send'))).toBe(true);
  });

  it('rilevia soglie incoerenti (auto < review)', () => {
    const bad = resolvePolicy(DEFAULT_WORKSPACE_POLICY, { thresholds: { minOpportunity: 50 } });
    expect(validatePolicyConfig(bad).some((e) => e.includes('minOpportunity'))).toBe(true);
  });
});
