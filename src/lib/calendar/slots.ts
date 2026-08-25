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
  opts?: { nowIso?: string; afterIso?: string | null },
): SlotLike | null {
  const floor = new Date(opts?.afterIso ?? opts?.nowIso ?? new Date().toISOString()).getTime();
  const available = slots
    .filter((s) => s.status === 'AVAILABLE')
    .filter((s) => new Date(s.starts_at).getTime() >= floor)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return available[0] ?? null;
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
