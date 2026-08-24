/**
 * Commercial defer vs permanent Send Guard block (§11.2 / Phase D.2).
 * Temporary blockers must reschedule the SEND job — never FAILED.
 */

import type { SendGuardContext } from '@/lib/send-guard';
import type { SendGuardResult } from '@/lib/types/domain';
import { isWithinSendWindow } from '@/lib/send-guard/build-context';

export type SendDeferReason =
  | 'OUTREACH_PAUSED'
  | 'CAMPAIGN_PAUSED'
  | 'OUTSIDE_SEND_WINDOW'
  | 'HOURLY_RATE_LIMIT'
  | 'DAILY_SEND_LIMIT';

export type SendGuardDisposition =
  | { kind: 'allow' }
  | { kind: 'defer'; reason: SendDeferReason; notBefore: Date; detail: string }
  | { kind: 'block'; detail: string };

const PAUSE_RETRY_MS = 15 * 60 * 1000;

export { PAUSE_RETRY_MS };

export function nextSendWindowOpen(
  window: { start?: string; end?: string; timezone?: string } | null | undefined,
  now: Date = new Date(),
): Date {
  if (!window?.start || !window?.end) {
    return new Date(now.getTime() + PAUSE_RETRY_MS);
  }
  const tz = window.timezone || 'Europe/Rome';
  // Search up to 48h ahead in 15-minute steps for first in-window instant
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 48 * 4; i += 1) {
    cursor.setTime(now.getTime() + i * 15 * 60 * 1000);
    if (isWithinSendWindow(window, cursor) && cursor.getTime() > now.getTime()) {
      return cursor;
    }
  }
  // Fallback: +1 day at configured start (best-effort via formatter)
  const [sh, sm] = window.start.split(':').map(Number);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // Approximate wall-clock in TZ using formatToParts on a candidate
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(tomorrow);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  // Construct as UTC noon then adjust — crude but deterministic for tests with fixed TZ offsets
  const guess = new Date(`${y}-${m}-${d}T${String(sh ?? 9).padStart(2, '0')}:${String(sm ?? 0).padStart(2, '0')}:00`);
  if (guess.getTime() > now.getTime()) return guess;
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function nextDayAtWindowStart(
  window: { start?: string; end?: string; timezone?: string } | null | undefined,
  now: Date = new Date(),
): Date {
  const start = window?.start ?? '09:00';
  const tz = window?.timezone || 'Europe/Rome';
  // Walk forward until we hit the first minute of a new calendar day (in TZ) at/after window start
  for (let h = 1; h <= 48; h += 1) {
    const candidate = new Date(now.getTime() + h * 60 * 60 * 1000);
    const dayParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(candidate);
    const hour = Number(dayParts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(dayParts.find((p) => p.type === 'minute')?.value ?? 0);
    const [sh, sm] = start.split(':').map(Number);
    if (hour === (sh ?? 9) && minute === (sm ?? 0)) {
      return candidate;
    }
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function nextHourSlot(now: Date = new Date()): Date {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/**
 * Classify Send Guard outcome for SEND_MESSAGE jobs.
 * Temporary commercial waits → defer; hard blockers → block (fail path).
 */
export function classifySendGuardDisposition(
  ctx: SendGuardContext,
  guard: SendGuardResult,
  now: Date = new Date(),
): SendGuardDisposition {
  if (guard.allowed) return { kind: 'allow' };

  const window = ctx.campaign.sendWindow ?? null;

  if (ctx.campaign.outreachPausedAll) {
    return {
      kind: 'defer',
      reason: 'OUTREACH_PAUSED',
      notBefore: new Date(now.getTime() + PAUSE_RETRY_MS),
      detail: 'Kill switch OUTREACH_PAUSED_ALL: defer commerciale',
    };
  }
  if (ctx.campaign.status !== 'ACTIVE') {
    return {
      kind: 'defer',
      reason: 'CAMPAIGN_PAUSED',
      notBefore: new Date(now.getTime() + PAUSE_RETRY_MS),
      detail: `Campaign ${ctx.campaign.status}: defer fino a riattivazione`,
    };
  }
  if (ctx.campaign.withinSendWindow === false) {
    return {
      kind: 'defer',
      reason: 'OUTSIDE_SEND_WINDOW',
      notBefore: nextSendWindowOpen(window, now),
      detail: 'Fuori send window: defer fino ad apertura',
    };
  }
  if (ctx.campaign.dailyRateAvailable === false) {
    return {
      kind: 'defer',
      reason: 'DAILY_SEND_LIMIT',
      notBefore: nextDayAtWindowStart(window, now),
      detail: 'Daily send limit: defer al giorno successivo',
    };
  }
  if (ctx.campaign.hourlyRateAvailable === false || ctx.campaign.rateLimitAvailable === false) {
    return {
      kind: 'defer',
      reason: 'HOURLY_RATE_LIMIT',
      notBefore: nextHourSlot(now),
      detail: 'Hourly rate limit: defer al prossimo slot',
    };
  }

  return { kind: 'block', detail: guard.blockers.join('; ') };
}

/** Thrown by handleSendMessage to signal commercial defer without technical fail. */
export class SendDeferredError extends Error {
  readonly defer: Extract<SendGuardDisposition, { kind: 'defer' }>;
  constructor(defer: Extract<SendGuardDisposition, { kind: 'defer' }>) {
    super(defer.detail);
    this.name = 'SendDeferredError';
    this.defer = defer;
  }
}
