/**
 * Server-side TEST campaign delivery safety.
 * UI is not sufficient — every send must pass through resolveTestDelivery().
 */

export type CampaignDeliveryMode = 'PRODUCTION' | 'TEST';

export class BlockedTestRecipientError extends Error {
  readonly code = 'BLOCKED_TEST_RECIPIENT' as const;
  constructor(detail: string) {
    super(`BLOCKED_TEST_RECIPIENT: ${detail}`);
    this.name = 'BlockedTestRecipientError';
  }
}

export function normalizeEmailAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmailShape(raw: string): boolean {
  const e = raw.trim();
  if (!e || e.length > 254) return false;
  // Strict enough for allowlist exact match — no display-name spoofing
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e);
}

/** Parse RESEND_TEST_RECIPIENT_ALLOWLIST (comma / whitespace separated). */
export function parseTestRecipientAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.RESEND_TEST_RECIPIENT_ALLOWLIST?.trim() ?? '';
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).map((p) => normalizeEmailAddress(p)).filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.filter((e) => isValidEmailShape(e));
}

export function isTestRecipientAllowlisted(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = normalizeEmailAddress(email);
  if (!isValidEmailShape(normalized)) return false;
  const list = parseTestRecipientAllowlist(env);
  return list.includes(normalized);
}

export type DeliveryResolution = {
  deliveryMode: CampaignDeliveryMode;
  intendedRecipient: string;
  actualDeliveryRecipient: string;
};

/**
 * Resolve who Resend may contact.
 * PRODUCTION → lead email (unchanged).
 * TEST → campaign.test_recipient must be exactly allowlisted; never fall back to lead.
 */
export function resolveTestDelivery(args: {
  deliveryMode: CampaignDeliveryMode | string | null | undefined;
  testRecipient: string | null | undefined;
  leadEmail: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): DeliveryResolution {
  const env = args.env ?? process.env;
  const mode = (args.deliveryMode ?? 'PRODUCTION').toString().toUpperCase();
  const lead = args.leadEmail?.trim() ?? '';

  if (mode !== 'TEST') {
    if (!lead || !isValidEmailShape(lead)) {
      throw new Error('Recipient email mancante o non valida');
    }
    const intended = normalizeEmailAddress(lead);
    return {
      deliveryMode: 'PRODUCTION',
      intendedRecipient: intended,
      actualDeliveryRecipient: intended,
    };
  }

  const testRaw = args.testRecipient?.trim() ?? '';
  if (!testRaw) {
    throw new BlockedTestRecipientError('test_recipient assente su campagna TEST');
  }
  if (!isValidEmailShape(testRaw)) {
    throw new BlockedTestRecipientError('test_recipient non valido');
  }

  const allowlist = parseTestRecipientAllowlist(env);
  if (allowlist.length === 0) {
    throw new BlockedTestRecipientError(
      'RESEND_TEST_RECIPIENT_ALLOWLIST vuota o non configurata',
    );
  }

  const actual = normalizeEmailAddress(testRaw);
  if (!allowlist.includes(actual)) {
    throw new BlockedTestRecipientError(
      'test_recipient non presente in RESEND_TEST_RECIPIENT_ALLOWLIST',
    );
  }

  // Intended = lead email for audit (may be empty only if somehow missing — still block send to lead)
  const intended = lead && isValidEmailShape(lead) ? normalizeEmailAddress(lead) : lead || '(nessuna email lead)';

  // Hard safety: never equalize to lead unless lead itself is allowlisted AND chosen as test_recipient
  if (lead && normalizeEmailAddress(lead) === actual && !allowlist.includes(actual)) {
    throw new BlockedTestRecipientError('fallback al lead bloccato');
  }

  return {
    deliveryMode: 'TEST',
    intendedRecipient: intended,
    actualDeliveryRecipient: actual,
  };
}

/** TEST sequence: step1 +5m, step2 +10m from origin (not delay_days). */
export function testSequenceDelayMs(step: number): number | null {
  if (step === 1) return 5 * 60 * 1000;
  if (step === 2) return 10 * 60 * 1000;
  return null;
}

export function getTestDeliveryStatus(env: NodeJS.ProcessEnv = process.env): {
  allowlist: 'READY' | 'MISSING';
  allowlistCount: number;
  safety: 'READY' | 'MISSING';
} {
  const list = parseTestRecipientAllowlist(env);
  const allowlist = list.length > 0 ? 'READY' : 'MISSING';
  return {
    allowlist,
    allowlistCount: list.length,
    safety: allowlist,
  };
}
