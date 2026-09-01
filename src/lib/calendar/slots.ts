import type { CalendarAvailabilitySlotRow } from '@/lib/types/database';

export type SlotLike = Pick<
  CalendarAvailabilitySlotRow,
  'id' | 'starts_at' | 'ends_at' | 'timezone' | 'status'
>;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function zonedDateTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = new Date(desiredAsUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = zonedParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate = new Date(candidate.getTime() + desiredAsUtc - actualAsUtc);
  }
  return candidate;
}

function addCalendarDays(parts: ZonedParts, days: number): ZonedParts {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function addWeeksInTimeZone(
  iso: string,
  weeks: number,
  timeZone = 'Europe/Rome',
): string {
  const local = zonedParts(new Date(iso), timeZone);
  return zonedDateTimeToUtc(addCalendarDays(local, weeks * 7), timeZone).toISOString();
}

export function resolvePreferredTimeHint(
  hint: string | null | undefined,
  opts?: { nowIso?: string; timeZone?: string },
): string | null {
  if (!hint?.trim()) return null;
  const isoMatch = hint.match(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?\b/,
  );
  if (isoMatch) {
    const explicit = new Date(isoMatch[0]);
    if (!Number.isNaN(explicit.getTime())) return explicit.toISOString();
  }
  const timeZone = opts?.timeZone ?? 'Europe/Rome';
  const now = new Date(opts?.nowIso ?? new Date().toISOString());
  const current = zonedParts(now, timeZone);
  const normalized = hint
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  const timeMatch =
    normalized.match(/\b(?:alle|ore)\s*(\d{1,2})(?:[:.](\d{2}))?\b/) ??
    normalized.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? 0);
  if (hour > 23 || minute > 59) return null;

  let target = { ...current, hour, minute, second: 0 };
  if (/\bdopodomani\b/.test(normalized)) {
    target = addCalendarDays(target, 2);
  } else if (/\bdomani\b/.test(normalized)) {
    target = addCalendarDays(target, 1);
  } else if (/\boggi\b/.test(normalized)) {
    // La data è già quella corrente.
  } else {
    const dateMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    if (dateMatch) {
      const rawYear = dateMatch[3] ? Number(dateMatch[3]) : current.year;
      target = {
        ...target,
        day: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        year: rawYear < 100 ? 2000 + rawYear : rawYear,
      };
    } else {
      const months: Array<[RegExp, number]> = [
        [/\bgennaio\b/, 1],
        [/\bfebbraio\b/, 2],
        [/\bmarzo\b/, 3],
        [/\baprile\b/, 4],
        [/\bmaggio\b/, 5],
        [/\bgiugno\b/, 6],
        [/\bluglio\b/, 7],
        [/\bagosto\b/, 8],
        [/\bsettembre\b/, 9],
        [/\bottobre\b/, 10],
        [/\bnovembre\b/, 11],
        [/\bdicembre\b/, 12],
      ];
      const month = months.find(([pattern]) => pattern.test(normalized));
      const dayWithMonth = normalized.match(/\b(\d{1,2})\s+[a-z]+\b/);
      if (month && dayWithMonth) {
        target = {
          ...target,
          day: Number(dayWithMonth[1]),
          month: month[1],
          year: current.year,
        };
        const candidate = zonedDateTimeToUtc(target, timeZone);
        if (candidate.getTime() < now.getTime()) target.year += 1;
        const resolved = zonedDateTimeToUtc(target, timeZone);
        return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
      }
      const weekdays: Array<[RegExp, number]> = [
        [/\bdomenica\b/, 0],
        [/\blunedi\b/, 1],
        [/\bmartedi\b/, 2],
        [/\bmercoledi\b/, 3],
        [/\bgiovedi\b/, 4],
        [/\bvenerdi\b/, 5],
        [/\bsabato\b/, 6],
      ];
      const weekday = weekdays.find(([pattern]) => pattern.test(normalized));
      if (!weekday) return null;
      const currentWeekday = new Date(
        Date.UTC(current.year, current.month - 1, current.day),
      ).getUTCDay();
      let daysAhead = (weekday[1] - currentWeekday + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      target = addCalendarDays(target, daysAhead);
    }
  }

  const resolved = zonedDateTimeToUtc(target, timeZone);
  return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
}

export function findSlotForPreferredTime(
  slots: SlotLike[],
  hint: string | null | undefined,
  opts?: { nowIso?: string; timeZone?: string },
): SlotLike | null {
  const targetIso = resolvePreferredTimeHint(hint, opts);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  return (
    slots.find(
      (slot) =>
        slot.status === 'AVAILABLE' &&
        Math.abs(new Date(slot.starts_at).getTime() - target) < 60_000,
    ) ?? null
  );
}

export function listClosestAvailableSlots(
  slots: SlotLike[],
  targetIso: string,
  limit = 3,
  nowIso?: string,
): SlotLike[] {
  const target = new Date(targetIso).getTime();
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  return slots
    .filter((slot) => slot.status === 'AVAILABLE')
    .filter((slot) => new Date(slot.starts_at).getTime() >= now)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.starts_at).getTime() - target) -
        Math.abs(new Date(b.starts_at).getTime() - target),
    )
    .slice(0, limit);
}

/**
 * Seleziona il primo slot AVAILABLE con inizio >= now (o afterIso),
 * ordinato cronologicamente. Nessuna ora inventata.
 */
export function pickFirstCompatibleSlot(
  slots: SlotLike[],
  opts?: {
    nowIso?: string;
    afterIso?: string | null;
    excludeStartsAt?: string[];
    excludeSlotIds?: string[];
  },
): SlotLike | null {
  const alternatives = listAlternativeSlots(slots, {
    nowIso: opts?.afterIso ?? opts?.nowIso,
    excludeStartsAt: opts?.excludeStartsAt,
    excludeSlotIds: opts?.excludeSlotIds,
    limit: 1,
  });
  return alternatives[0] ?? null;
}

/** Slot liberi diversi da un appuntamento già fissato (per riprogrammazione). */
export function listAlternativeSlots(
  slots: SlotLike[],
  opts?: {
    nowIso?: string;
    excludeStartsAt?: string[];
    excludeSlotIds?: string[];
    limit?: number;
  },
): SlotLike[] {
  const floor = new Date(opts?.nowIso ?? new Date().toISOString()).getTime();
  const excludedStarts = new Set((opts?.excludeStartsAt ?? []).map((iso) => new Date(iso).getTime()));
  const excludedIds = new Set(opts?.excludeSlotIds ?? []);
  const limit = opts?.limit ?? 5;
  return slots
    .filter((s) => s.status === 'AVAILABLE')
    .filter((s) => !excludedIds.has(s.id))
    .filter((s) => !excludedStarts.has(new Date(s.starts_at).getTime()))
    .filter((s) => new Date(s.starts_at).getTime() >= floor)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, limit);
}

export function formatSlotForHuman(slot: SlotLike, locale = 'it-IT'): string {
  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: slot.timezone || 'Europe/Rome',
  }).format(start);
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: slot.timezone || 'Europe/Rome',
  });
  return `${day}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export function slotsForAiPrompt(slots: SlotLike[], limit = 5): Array<{
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
}> {
  return slots
    .filter((s) => s.status === 'AVAILABLE')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      label: formatSlotForHuman(s),
      startsAt: s.starts_at,
      endsAt: s.ends_at,
    }));
}
