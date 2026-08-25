import type { CalendarAvailabilitySlotRow } from '@/lib/types/database';

export type SlotLike = Pick<
  CalendarAvailabilitySlotRow,
  'id' | 'starts_at' | 'ends_at' | 'timezone' | 'status'
>;

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
