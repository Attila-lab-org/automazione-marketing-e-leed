/**
 * Policy Engine — MASTER_SPEC §4, §4.1, §5.2.
 *
 * - Le tre modalità MANUAL / SCORE_BASED / FULL_AUTO sono configurazioni runtime
 *   di un unico engine, non rami di codice (§1 Policy-driven).
 * - Policy definite a livello workspace, sovrascritte a livello campaign/category
 *   (§4.1) tramite merge di override parziali.
 * - POLICY SNAPSHOT (§4.1): la policy risolta viene congelata in uno snapshot
 *   immutabile; modifiche future non cambiano i job già materializzati.
 * - Il POLICY ENGINE decide, non lo Score Engine (§5.2).
 */

import {
  POLICY_ACTIONS,
  type BusinessStatus,
  type LeadScore,
  type PolicyAction,
  type PolicyConfig,
  type PolicyEvaluation,
  type PolicyEvaluationInput,
  type PolicyGateMode,
  type PolicyMode,
  type PolicyOverride,
  type PolicySnapshot,
  type SendThresholds,
} from '../types/domain';

/** Business status considerati "attivi" per la regola §5.2 (default, configurabile). */
export const DEFAULT_ACTIVE_BUSINESS_STATUSES: readonly BusinessStatus[] = [
  'NEW',
  'QUALIFIED',
  'CAMPAIGN_READY',
  'CONTACTED',
];

/** Soglie di default: regola decisionale §5.2. */
export const DEFAULT_SEND_THRESHOLDS: SendThresholds = {
  minOpportunity: 85,
  minConfidence: 85,
  minContactability: 80,
  requireValidEmail: true,
  activeBusinessStatuses: [...DEFAULT_ACTIVE_BUSINESS_STATUSES],
  // Fascia intermedia → Review Queue (§4): sotto questi minimi → BLOCKED.
  reviewMinOpportunity: 60,
  reviewMinConfidence: 60,
  reviewMinContactability: 50,
};

/**
 * Policy default di workspace — Safe-by-default (§1, §6.2): mode MANUAL e tutti
 * i gate manuali; l'automazione è sempre una scelta esplicita dell'owner.
 */
export const DEFAULT_WORKSPACE_POLICY: PolicyConfig = {
  mode: 'MANUAL',
  actions: {
    discovery: 'MANUAL',
    enrichment: 'MANUAL',
    website_analysis: 'MANUAL',
    demo_generation: 'MANUAL',
    screenshot: 'AUTO',
    message_generation: 'AUTO',
    send: 'MANUAL',
    followup: 'MANUAL',
  },
  thresholds: { ...DEFAULT_SEND_THRESHOLDS, activeBusinessStatuses: [...DEFAULT_ACTIVE_BUSINESS_STATUSES] },
  rateLimit: { perHour: 20, perDay: 100 },
  sendWindow: { startHour: null, endHour: null, timezone: null },
  dailyLimit: null,
};

// ---------------------------------------------------------------------------
// Risoluzione workspace → campaign/category (§4.1)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge profondo di override parziali. Gli override successivi vincono.
 * Nessuna mutazione degli input: ritorna sempre una struttura nuova.
 */
export function resolvePolicy(base: PolicyConfig, ...overrides: Array<PolicyOverride | null | undefined>): PolicyConfig {
  const merged: PolicyConfig = {
    ...base,
    actions: { ...base.actions },
    thresholds: { ...base.thresholds, activeBusinessStatuses: [...base.thresholds.activeBusinessStatuses] },
    rateLimit: { ...base.rateLimit },
    sendWindow: { ...base.sendWindow },
  };

  for (const override of overrides) {
    if (!override) continue;
    if (override.mode) merged.mode = override.mode;
    if (override.dailyLimit !== undefined) merged.dailyLimit = override.dailyLimit;
    if (override.actions) {
      for (const [action, gate] of Object.entries(override.actions)) {
        if (gate) merged.actions[action as PolicyAction] = gate;
      }
    }
    if (override.thresholds) {
      const t = override.thresholds;
      for (const [key, value] of Object.entries(t)) {
        if (value === undefined) continue;
        if (key === 'activeBusinessStatuses' && Array.isArray(value)) {
          merged.thresholds.activeBusinessStatuses = [...value] as BusinessStatus[];
        } else if (isPlainObject(merged.thresholds)) {
          (merged.thresholds as Record<string, unknown>)[key] = value;
        }
      }
    }
    if (override.rateLimit) {
      if (override.rateLimit.perHour !== undefined) merged.rateLimit.perHour = override.rateLimit.perHour;
      if (override.rateLimit.perDay !== undefined) merged.rateLimit.perDay = override.rateLimit.perDay;
    }
    if (override.sendWindow) {
      merged.sendWindow = { ...merged.sendWindow, ...override.sendWindow };
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Policy snapshot immutabile (§4.1)
// ---------------------------------------------------------------------------

export interface CreateSnapshotOptions {
  policyVersionId?: string | null;
  campaignId?: string | null;
  version?: number | null;
  now?: Date;
}

/**
 * Congela la policy risolta in uno snapshot immutabile (deep-frozen).
 * Lo snapshot sopravvive a modifiche/disattivazioni della policy version.
 */
export function createPolicySnapshot(config: PolicyConfig, options: CreateSnapshotOptions = {}): PolicySnapshot {
  const snapshot: PolicySnapshot = {
    policyVersionId: options.policyVersionId ?? null,
    campaignId: options.campaignId ?? null,
    version: options.version ?? null,
    capturedAt: (options.now ?? new Date()).toISOString(),
    config: structuredClone(config),
  };
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (isPlainObject(value) || Array.isArray(value)) {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Valutazione gate §4.1 + regola decisionale §5.2
// ---------------------------------------------------------------------------

/** Gate consentiti per azione (migration plan §3.3). */
export const ALLOWED_GATE_MODES: Record<PolicyAction, readonly PolicyGateMode[]> = {
  discovery: ['AUTO', 'MANUAL'],
  enrichment: ['AUTO', 'MANUAL'],
  website_analysis: ['AUTO', 'MANUAL'],
  demo_generation: ['AUTO', 'SCORE_THRESHOLD', 'MANUAL'],
  screenshot: ['AUTO', 'MANUAL'],
  message_generation: ['AUTO', 'MANUAL'],
  send: ['MANUAL', 'SCORE_THRESHOLD', 'AUTO'],
  followup: ['OFF', 'MANUAL', 'AUTO'],
};

interface ThresholdCheckResult {
  autoPass: boolean;
  reviewPass: boolean;
  failures: string[];
  passes: string[];
}

function checkSendThresholds(thresholds: SendThresholds, input: PolicyEvaluationInput): ThresholdCheckResult {
  const score: LeadScore | null = input.score;
  const failures: string[] = [];
  const passes: string[] = [];

  const opportunity = score?.opportunityScore ?? 0;
  const confidence = score?.confidence ?? 0;
  const contactability = score?.contactabilityScore ?? 0;

  if (!score) failures.push('score mancante: impossibile valutare le soglie §5.2');

  if (opportunity >= thresholds.minOpportunity) {
    passes.push(`opportunity ${opportunity} >= ${thresholds.minOpportunity}`);
  } else {
    failures.push(`opportunity ${opportunity} < ${thresholds.minOpportunity}`);
  }

  if (confidence >= thresholds.minConfidence) {
    passes.push(`confidence ${confidence} >= ${thresholds.minConfidence}`);
  } else {
    failures.push(`confidence ${confidence} < ${thresholds.minConfidence}`);
  }

  if (contactability >= thresholds.minContactability) {
    passes.push(`contactability ${contactability} >= ${thresholds.minContactability}`);
  } else {
    failures.push(`contactability ${contactability} < ${thresholds.minContactability}`);
  }

  if (thresholds.requireValidEmail) {
    if (input.validEmail) passes.push('valid_email = true');
    else failures.push('valid_email = false (richiesta da §5.2)');
  }

  if (thresholds.activeBusinessStatuses.includes(input.businessStatus)) {
    passes.push(`business_status ${input.businessStatus} attivo`);
  } else {
    failures.push(`business_status ${input.businessStatus} non attivo (§5.2)`);
  }

  const reviewPass =
    opportunity >= thresholds.reviewMinOpportunity &&
    confidence >= thresholds.reviewMinConfidence &&
    contactability >= thresholds.reviewMinContactability &&
    input.validEmail &&
    thresholds.activeBusinessStatuses.includes(input.businessStatus);

  return { autoPass: failures.length === 0, reviewPass, failures, passes };
}

function resolveEffectiveGateMode(snapshot: PolicySnapshot, action: PolicyAction): PolicyGateMode {
  const configured = snapshot.config.actions[action];
  if (!ALLOWED_GATE_MODES[action].includes(configured)) {
    // Config incoerente → fail-safe: mai auto per una configurazione invalida.
    return action === 'followup' ? 'OFF' : 'MANUAL';
  }
  // In FULL_AUTO i gate SCORE_THRESHOLD si comportano come AUTO: la pipeline
  // completa procede senza blocchi manuali, ma Send Guard/suppression/kill
  // switch restano attivi (§4). La mode MANUAL esplicita resta rispettata.
  if (snapshot.config.mode === 'FULL_AUTO' && configured === 'SCORE_THRESHOLD') {
    return 'AUTO';
  }
  return configured;
}

/**
 * Valuta il gate per una singola azione dato uno snapshot di policy (§4.1).
 * Per l'azione `send` applica la regola decisionale §5.2.
 */
export function evaluatePolicyGate(snapshot: PolicySnapshot, input: PolicyEvaluationInput): PolicyEvaluation {
  const gateMode = resolveEffectiveGateMode(snapshot, input.action);
  const evaluatedAt = new Date().toISOString();
  const base = {
    action: input.action,
    gateMode,
    policyVersionId: snapshot.policyVersionId,
    policyVersion: snapshot.version,
    evaluatedAt,
  };

  if (gateMode === 'OFF') {
    return { ...base, decision: 'BLOCKED', autoApproved: false, reasons: [`gate ${input.action} = OFF`] };
  }

  if (gateMode === 'MANUAL') {
    return {
      ...base,
      decision: 'MANUAL',
      autoApproved: false,
      reasons: [`gate ${input.action} = MANUAL: richiesta approvazione umana`],
    };
  }

  if (gateMode === 'AUTO') {
    // In FULL_AUTO/AUTO l'unico blocco residuo lato policy è uno stato lead
    // palesemente non contattabile (SUPPRESSED): il resto è compito del Send Guard.
    if (input.action === 'send' && input.businessStatus === 'SUPPRESSED') {
      return {
        ...base,
        decision: 'BLOCKED',
        autoApproved: false,
        reasons: ['business_status SUPPRESSED: blocco anche in FULL_AUTO (safe-by-default)'],
      };
    }
    return { ...base, decision: 'AUTO', autoApproved: true, reasons: [`gate ${input.action} = AUTO`] };
  }

  // SCORE_THRESHOLD — regola decisionale §5.2 (il Policy Engine decide).
  const check = checkSendThresholds(snapshot.config.thresholds, input);
  if (check.autoPass) {
    return {
      ...base,
      decision: 'AUTO',
      autoApproved: true,
      reasons: ['soglie §5.2 soddisfatte', ...check.passes],
    };
  }
  if (check.reviewPass) {
    return {
      ...base,
      decision: 'REVIEW',
      autoApproved: false,
      reasons: ['fascia intermedia → Review Queue (§4)', ...check.failures],
    };
  }
  return {
    ...base,
    decision: 'BLOCKED',
    autoApproved: false,
    reasons: ['sotto la fascia review: bloccato', ...check.failures],
  };
}

/**
 * Verifica di coerenza di una config policy: ogni azione ha un gate ammesso
 * (§4.1) e la mode è valida. Utile a monte (campaign wizard §8.1).
 */
export function validatePolicyConfig(config: PolicyConfig): string[] {
  const errors: string[] = [];
  for (const action of POLICY_ACTIONS) {
    const gate = config.actions[action];
    if (!gate) {
      errors.push(`gate mancante per azione "${action}"`);
    } else if (!ALLOWED_GATE_MODES[action].includes(gate)) {
      errors.push(`gate "${gate}" non ammesso per azione "${action}" (§4.1)`);
    }
  }
  const t = config.thresholds;
  if (t.minOpportunity < t.reviewMinOpportunity) {
    errors.push('thresholds: minOpportunity deve essere >= reviewMinOpportunity');
  }
  if (t.minConfidence < t.reviewMinConfidence) {
    errors.push('thresholds: minConfidence deve essere >= reviewMinConfidence');
  }
  if (t.minContactability < t.reviewMinContactability) {
    errors.push('thresholds: minContactability deve essere >= reviewMinContactability');
  }
  return errors;
}

/** Comodo helper: modalità effettiva risolta (per badge UI §21 Policy Badge). */
export function effectiveMode(snapshot: PolicySnapshot): PolicyMode {
  return snapshot.config.mode;
}
