export const SALES_STATES = [
  'NEW',
  'CONTACTED',
  'REPLIED',
  'ENGAGED',
  'QUALIFYING',
  'INTERESTED',
  'PRICING',
  'CALL_PROPOSED',
  'CALL_BOOKED',
  'FOLLOW_UP_LATER',
  'HUMAN_REQUIRED',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'UNSUBSCRIBED',
] as const;

export type SalesState = (typeof SALES_STATES)[number];

const ALLOWED: Record<SalesState, SalesState[]> = {
  NEW: [
    'CONTACTED',
    'REPLIED',
    'ENGAGED',
    'QUALIFYING',
    'INTERESTED',
    'PRICING',
    'FOLLOW_UP_LATER',
    'CALL_PROPOSED',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  CONTACTED: ['REPLIED', 'ENGAGED', 'FOLLOW_UP_LATER', 'NOT_INTERESTED', 'UNSUBSCRIBED', 'HUMAN_REQUIRED'],
  REPLIED: [
    'ENGAGED',
    'QUALIFYING',
    'INTERESTED',
    'PRICING',
    'FOLLOW_UP_LATER',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  ENGAGED: [
    'QUALIFYING',
    'INTERESTED',
    'PRICING',
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'FOLLOW_UP_LATER',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  QUALIFYING: [
    'INTERESTED',
    'PRICING',
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'FOLLOW_UP_LATER',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  INTERESTED: [
    'PRICING',
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'FOLLOW_UP_LATER',
    'WON',
    'LOST',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  PRICING: [
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'INTERESTED',
    'FOLLOW_UP_LATER',
    'WON',
    'LOST',
    'HUMAN_REQUIRED',
    'UNSUBSCRIBED',
    'NOT_INTERESTED',
  ],
  CALL_PROPOSED: ['CALL_BOOKED', 'FOLLOW_UP_LATER', 'PRICING', 'HUMAN_REQUIRED', 'LOST', 'UNSUBSCRIBED'],
  CALL_BOOKED: [
    'CALL_PROPOSED',
    'WON',
    'LOST',
    'FOLLOW_UP_LATER',
    'HUMAN_REQUIRED',
    'UNSUBSCRIBED',
  ],
  FOLLOW_UP_LATER: [
    'REPLIED',
    'ENGAGED',
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
    'HUMAN_REQUIRED',
  ],
  HUMAN_REQUIRED: [
    'CONTACTED',
    'REPLIED',
    'ENGAGED',
    'QUALIFYING',
    'INTERESTED',
    'PRICING',
    'CALL_PROPOSED',
    'CALL_BOOKED',
    'FOLLOW_UP_LATER',
    'WON',
    'LOST',
    'NOT_INTERESTED',
    'UNSUBSCRIBED',
  ],
  WON: ['UNSUBSCRIBED'],
  LOST: ['UNSUBSCRIBED', 'ENGAGED'],
  NOT_INTERESTED: ['UNSUBSCRIBED', 'ENGAGED'],
  UNSUBSCRIBED: [],
};

export function isSalesState(value: string): value is SalesState {
  return (SALES_STATES as readonly string[]).includes(value);
}

export function validateSalesTransition(
  from: string | null | undefined,
  proposed: string,
): { ok: true; state: SalesState } | { ok: false; reason: string } {
  if (!isSalesState(proposed)) {
    return { ok: false, reason: 'stato commerciale non valido' };
  }
  const current: SalesState = isSalesState(from ?? '') ? (from as SalesState) : 'NEW';
  if (current === proposed) return { ok: true, state: proposed };
  if (proposed === 'UNSUBSCRIBED' || proposed === 'NOT_INTERESTED' || proposed === 'HUMAN_REQUIRED') {
    return { ok: true, state: proposed };
  }
  if (!ALLOWED[current].includes(proposed)) {
    return { ok: false, reason: `transizione ${current} → ${proposed} non consentita` };
  }
  return { ok: true, state: proposed };
}

/**
 * Inbound (Telegram/email): GPT può proporre ENGAGED/QUALIFYING da NEW,
 * o HUMAN_REQUIRED su una richiesta custom. Quello non è un veto di invio.
 * HUMAN_REQUIRED di stato resta solo se il mode è davvero HUMAN_ONLY.
 */
export function resolveInboundCommercialState(args: {
  from: string | null | undefined;
  recommended: string;
  humanOnly: boolean;
}): SalesState {
  const recommended =
    args.recommended === 'HUMAN_REQUIRED' && !args.humanOnly ? 'ENGAGED' : args.recommended;
  const transition = validateSalesTransition(args.from, recommended);
  if (transition.ok) return transition.state;
  if (!args.humanOnly) {
    const fallback = validateSalesTransition(args.from, 'ENGAGED');
    if (fallback.ok) return fallback.state;
    const current: SalesState = isSalesState(args.from ?? '') ? (args.from as SalesState) : 'NEW';
    if (current !== 'HUMAN_REQUIRED' && current !== 'UNSUBSCRIBED') return current;
    return 'ENGAGED';
  }
  return 'HUMAN_REQUIRED';
}
