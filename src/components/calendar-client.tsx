"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CalendarLead = { id: string; name: string } | null;

type CalendarEvent = {
  id: string;
  event_type: "APPOINTMENT" | "WORK_DEADLINE" | "REMINDER";
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  status: string;
  lead_id: string | null;
  thread_id: string | null;
  timezone: string;
  lead: CalendarLead;
};

type CalendarSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "AVAILABLE" | "BOOKED" | "BLOCKED";
  note: string | null;
  timezone: string;
};

type FilterType = "all" | "APPOINTMENT" | "WORK_DEADLINE" | "REMINDER";

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function fmtTime(iso: string | null, tz = "Europe/Rome"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarClient() {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [filter, setFilter] = useState<FilterType>("all");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState(() => toLocalInputValue(addDays(new Date(), 1)));
  const [slotEnd, setSlotEnd] = useState(() => {
    const d = addDays(new Date(), 1);
    d.setMinutes(d.getMinutes() + 30);
    return toLocalInputValue(d);
  });
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState<"APPOINTMENT" | "WORK_DEADLINE" | "REMINDER">(
    "WORK_DEADLINE",
  );
  const [eventWhen, setEventWhen] = useState(() => toLocalInputValue(addDays(new Date(), 2)));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        week: weekAnchor.toISOString(),
        type: filter,
      });
      const res = await fetch(`/api/calendar?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Caricamento fallito");
      setEvents(data.events ?? []);
      setSlots(data.slots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore calendario");
    } finally {
      setLoading(false);
    }
  }, [weekAnchor, filter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

  async function createSlot() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "slot",
          startsAt: new Date(slotStart).toISOString(),
          endsAt: new Date(slotEnd).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione slot fallita");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creazione slot fallita");
    } finally {
      setBusy(false);
    }
  }

  async function createEvent() {
    setBusy(true);
    setError(null);
    try {
      const whenIso = new Date(eventWhen).toISOString();
      const endIso = new Date(new Date(eventWhen).getTime() + 30 * 60_000).toISOString();
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "event",
          title: eventTitle || "Nuovo evento",
          eventType,
          startsAt: eventType === "APPOINTMENT" ? whenIso : null,
          endsAt: eventType === "APPOINTMENT" ? endIso : null,
          dueAt: eventType === "APPOINTMENT" ? null : whenIso,
          reminderAt: eventType === "REMINDER" ? whenIso : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione evento fallita");
      setEventTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creazione evento fallita");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "event", action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Annullamento fallito");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annullamento fallito");
    } finally {
      setBusy(false);
    }
  }

  const agenda = [...events].sort((a, b) => {
    const aAt = a.starts_at ?? a.due_at ?? "";
    const bAt = b.starts_at ?? b.due_at ?? "";
    return aAt.localeCompare(bAt);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekAnchor((w) => addDays(w, -7))}
          >
            ← Settimana
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekAnchor(startOfWeek(new Date()))}
          >
            Oggi
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekAnchor((w) => addDays(w, 7))}
          >
            Settimana →
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Tutti"],
              ["APPOINTMENT", "Appuntamenti"],
              ["WORK_DEADLINE", "Scadenze"],
              ["REMINDER", "Promemoria"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? "rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {loading ? <p className="text-sm text-stone-500">Caricamento calendario…</p> : null}

      <section className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const dayKey = day.toDateString();
          const dayEvents = events.filter((event) => {
            const at = event.starts_at ?? event.due_at;
            return at ? new Date(at).toDateString() === dayKey : false;
          });
          const daySlots = slots.filter((slot) => new Date(slot.starts_at).toDateString() === dayKey);
          return (
            <div key={dayKey} className="min-h-40 rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{fmtDay(day)}</p>
              <div className="mt-2 space-y-2">
                {daySlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={
                      slot.status === "AVAILABLE"
                        ? "rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
                        : "rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] text-stone-600"
                    }
                  >
                    Slot {fmtTime(slot.starts_at, slot.timezone)} · {slot.status}
                  </div>
                ))}
                {dayEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-950">
                    <p className="font-semibold">{event.title}</p>
                    <p>
                      {fmtTime(event.starts_at ?? event.due_at, event.timezone)} · {event.event_type}
                    </p>
                    {event.lead?.name ? <p className="text-sky-800">{event.lead.name}</p> : null}
                  </div>
                ))}
                {!dayEvents.length && !daySlots.length ? (
                  <p className="text-[11px] text-stone-400">Niente in agenda</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-stone-900">Nuovo slot disponibile</h3>
          <label className="block text-xs text-stone-600">
            Inizio
            <input
              type="datetime-local"
              value={slotStart}
              onChange={(e) => setSlotStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-stone-600">
            Fine
            <input
              type="datetime-local"
              value={slotEnd}
              onChange={(e) => setSlotEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createSlot()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Aggiungi slot
          </button>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-stone-900">Nuovo evento operativo</h3>
          <label className="block text-xs text-stone-600">
            Titolo
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Es. Consegna sito / Richiamare cliente"
            />
          </label>
          <label className="block text-xs text-stone-600">
            Tipo
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as typeof eventType)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              <option value="APPOINTMENT">Appuntamento</option>
              <option value="WORK_DEADLINE">Scadenza lavoro</option>
              <option value="REMINDER">Promemoria</option>
            </select>
          </label>
          <label className="block text-xs text-stone-600">
            Quando
            <input
              type="datetime-local"
              value={eventWhen}
              onChange={(e) => setEventWhen(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createEvent()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Crea evento
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900">Agenda prossimi eventi</h3>
        <div className="mt-3 divide-y divide-stone-100">
          {agenda.length ? (
            agenda.map((event) => (
              <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-stone-900">{event.title}</p>
                  <p className="text-sm text-stone-600">
                    {event.event_type} · {fmtTime(event.starts_at ?? event.due_at, event.timezone)}
                    {event.lead?.name ? ` · ${event.lead.name}` : ""}
                  </p>
                  {event.thread_id ? (
                    <a href="/inbox" className="text-xs font-medium text-sky-700 hover:underline">
                      Apri conversazione →
                    </a>
                  ) : null}
                </div>
                {event.event_type === "APPOINTMENT" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelEvent(event.id)}
                    className="rounded-md border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700"
                  >
                    Annulla
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-stone-500">Nessun evento in questa settimana.</p>
          )}
        </div>
      </section>
    </div>
  );
}
