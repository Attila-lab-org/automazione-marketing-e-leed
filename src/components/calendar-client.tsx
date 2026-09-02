"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CalendarLead = { id: string; name: string } | null;

type CalendarThread = {
  id: string;
  channel: string | null;
  commercialState: string | null;
  nextStep: string | null;
  preview: string | null;
} | null;

type CalendarEvent = {
  id: string;
  event_type: "APPOINTMENT" | "WORK_DEADLINE" | "REMINDER";
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  status: string;
  source: "AI" | "HUMAN" | "SYSTEM";
  lead_id: string | null;
  thread_id: string | null;
  timezone: string;
  lead: CalendarLead;
  thread: CalendarThread;
};

type CalendarSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "AVAILABLE" | "BOOKED" | "BLOCKED";
  note: string | null;
  timezone: string;
};

type FilterType = "all" | "APPOINTMENT" | "WORK_DEADLINE" | "REMINDER" | "AVAILABILITY";
type CreateKind = "APPOINTMENT" | "AVAILABILITY" | "WORK_DEADLINE" | "REMINDER";
type ContactOption = { leadId: string; name: string; threadId: string | null };

type SelectedItem =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "slot"; slot: CalendarSlot };

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
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(iso: string | null, tz = "Europe/Rome"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function fmtDateTime(iso: string | null, tz = "Europe/Rome"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventTypeLabel(type: CalendarEvent["event_type"]): string {
  if (type === "APPOINTMENT") return "Appuntamento";
  if (type === "WORK_DEADLINE") return "Scadenza";
  return "Promemoria";
}

function sourceLabel(source: CalendarEvent["source"]): string {
  if (source === "AI") return "Prenotato da Attila";
  if (source === "HUMAN") return "Creato da te";
  return "Sistema";
}

function commercialLabel(state: string | null): string {
  if (!state) return "—";
  const labels: Record<string, string> = {
    NEW: "Nuovo",
    ENGAGED: "Conversazione avviata",
    QUALIFYING: "Qualificazione",
    INTERESTED: "Interessato",
    PRICING: "Prezzo",
    CALL_PROPOSED: "Chiamata proposta",
    CALL_BOOKED: "Appuntamento fissato",
    FOLLOW_UP_LATER: "Da ricontattare",
    HUMAN_REQUIRED: "Serve intervento",
    NOT_INTERESTED: "Non interessato",
    UNSUBSCRIBED: "Non contattare",
  };
  return labels[state] ?? state;
}

function channelLabel(channel: string | null): string {
  if (channel === "TELEGRAM") return "Telegram";
  if (channel === "EMAIL") return "Email";
  return channel ?? "Canale";
}

function conversationHref(event: CalendarEvent): string | null {
  if (event.thread_id) return `/inbox?thread=${encodeURIComponent(event.thread_id)}`;
  if (event.lead_id) return `/inbox?lead=${encodeURIComponent(event.lead_id)}`;
  return null;
}

function eventChipClass(type: CalendarEvent["event_type"]): string {
  if (type === "APPOINTMENT") {
    return "w-full rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] text-sky-950 hover:border-sky-400";
  }
  if (type === "WORK_DEADLINE") {
    return "w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-left text-[11px] text-amber-950 hover:border-amber-400";
  }
  return "w-full rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-left text-[11px] text-violet-950 hover:border-violet-400";
}

export default function CalendarClient() {
  const [weekAnchor, setWeekAnchor] = useState(() => {
    if (typeof window === "undefined") return startOfWeek(new Date());
    const week = new URLSearchParams(window.location.search).get("week");
    if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
      const [y, m, d] = week.split("-").map(Number);
      return startOfWeek(new Date(y, m - 1, d));
    }
    return startOfWeek(new Date());
  });
  const [filter, setFilter] = useState<FilterType>("all");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>("APPOINTMENT");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => toLocalInputValue(addDays(new Date(), 1)));
  const [slotEnd, setSlotEnd] = useState(() => {
    const d = addDays(new Date(), 1);
    d.setMinutes(d.getMinutes() + 30);
    return toLocalInputValue(d);
  });
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("focus");
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventType =
        filter === "all" || filter === "AVAILABILITY" ? "all" : filter;
      const params = new URLSearchParams({
        week: dateKey(weekAnchor),
        type: eventType,
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

  useEffect(() => {
    if (loading || !pendingFocusId || selected) return;
    const timeout = window.setTimeout(() => {
      const event = events.find((item) => item.id === pendingFocusId);
      if (!event) return;
      setSelected({ kind: "event", event });
      setPendingFocusId(null);
      const params = new URLSearchParams(window.location.search);
      params.delete("focus");
      const next = params.toString();
      window.history.replaceState(
        null,
        "",
        next ? `${window.location.pathname}?${next}` : window.location.pathname,
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loading, events, pendingFocusId, selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/inbox", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || cancelled) return;
        const options: ContactOption[] = ((data.threads as Array<{
          leadId: string;
          leadName: string;
          threadId: string;
        }>) ?? []).map((thread) => ({
          leadId: thread.leadId,
          name: thread.leadName,
          threadId: thread.threadId,
        }));
        const unique = new Map<string, ContactOption>();
        for (const option of options) {
          if (!unique.has(option.leadId)) unique.set(option.leadId, option);
        }
        setContactOptions([...unique.values()].slice(0, 40));
      } catch {
        // Il collegamento contatto resta opzionale.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor],
  );

  const showSlots = filter === "AVAILABILITY" || filter === "all";
  const showEvents = filter !== "AVAILABILITY";

  async function createItem() {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (createKind === "AVAILABILITY") {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "slot",
            startsAt: new Date(when).toISOString(),
            endsAt: new Date(slotEnd).toISOString(),
            repeatWeeks,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Creazione disponibilità fallita");
        setFeedback(
          repeatWeeks === 1
            ? "Disponibilità aggiunta."
            : `Disponibilità aggiunta per ${repeatWeeks} settimane.`,
        );
      } else {
        const whenIso = new Date(when).toISOString();
        const endIso = new Date(new Date(when).getTime() + 30 * 60_000).toISOString();
        const contact = contactOptions.find((item) => item.leadId === selectedContact);
        const defaultTitle =
          createKind === "APPOINTMENT"
            ? contact
              ? `Chiamata · ${contact.name}`
              : "Appuntamento"
            : createKind === "WORK_DEADLINE"
              ? "Scadenza lavoro"
              : "Promemoria";
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "event",
            title: title.trim() || defaultTitle,
            eventType: createKind,
            startsAt: createKind === "APPOINTMENT" ? whenIso : null,
            endsAt: createKind === "APPOINTMENT" ? endIso : null,
            dueAt: createKind === "APPOINTMENT" ? null : whenIso,
            reminderAt: createKind === "REMINDER" ? whenIso : null,
            leadId: contact?.leadId ?? null,
            threadId: contact?.threadId ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Creazione evento fallita");
        setFeedback("Elemento aggiunto al calendario.");
      }
      setCreateOpen(false);
      setTitle("");
      setSelectedContact("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creazione fallita");
    } finally {
      setBusy(false);
    }
  }

  async function mutateEvent(
    event: CalendarEvent,
    action: "cancel" | "reschedule" | "complete",
  ) {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (action === "cancel" && !window.confirm("Annullare questo elemento?")) {
        setBusy(false);
        return;
      }
      const res = await fetch(`/api/calendar/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "event",
          action,
          leadId: event.lead_id ?? undefined,
          threadId: event.thread_id,
          title: event.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Operazione non riuscita");
      setFeedback(
        action === "cancel"
          ? "Elemento annullato."
          : action === "complete"
            ? "Segnato come completato."
            : "Appuntamento riprogrammato sul prossimo slot libero.",
      );
      setSelected(null);
      setActionsOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSlot(slot: CalendarSlot) {
    if (!window.confirm("Togliere questo orario? Non sarà più prenotabile finché non lo riapri.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/${slot.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eliminazione fallita");
        setFeedback("Orario chiuso: Attila non lo proporrà più.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eliminazione fallita");
    } finally {
      setBusy(false);
    }
  }

  const selectedEvent = selected?.kind === "event" ? selected.event : null;
  const selectedSlot = selected?.kind === "slot" ? selected.slot : null;
  const openConversationUrl = selectedEvent ? conversationHref(selectedEvent) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekAnchor((w) => addDays(w, -7))}
          >
            ←
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
            →
          </button>
          <p className="text-sm font-medium text-stone-700">
            {fmtDay(weekAnchor)} – {fmtDay(addDays(weekAnchor, 6))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setFeedback(null);
          }}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
        >
          + Aggiungi
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Tutti"],
            ["APPOINTMENT", "Appuntamenti"],
            ["WORK_DEADLINE", "Scadenze"],
            ["REMINDER", "Promemoria"],
            ["AVAILABILITY", "Disponibilità"],
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

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {feedback ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {feedback}
        </div>
      ) : null}
      {loading ? <p className="text-sm text-stone-500">Caricamento calendario…</p> : null}

      <section className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const dayKey = day.toDateString();
          const dayEvents = showEvents
            ? events.filter((event) => {
                const at = event.starts_at ?? event.due_at;
                return at ? new Date(at).toDateString() === dayKey : false;
              })
            : [];
          const daySlots = showSlots
            ? slots.filter((slot) => new Date(slot.starts_at).toDateString() === dayKey)
            : [];
          const nowMs = Date.now();
          const freeSlots = daySlots.filter(
            (slot) =>
              slot.status === "AVAILABLE" && new Date(slot.starts_at).getTime() >= nowMs,
          );
          const weekday = day.getDay();
          const workingDay = weekday >= 1 && weekday <= 5;
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div
              key={dayKey}
              className={
                isToday
                  ? "min-h-44 rounded-xl border border-sky-300 bg-sky-50/40 p-3"
                  : "min-h-44 rounded-xl border border-stone-200 bg-white p-3"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {fmtDay(day)}
              </p>
              <div className="mt-2 space-y-2">
                {filter === "AVAILABILITY"
                  ? daySlots
                      .filter(
                        (slot) =>
                          slot.status !== "AVAILABLE" ||
                          new Date(slot.starts_at).getTime() >= nowMs,
                      )
                      .map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          setSelected({ kind: "slot", slot });
                          setActionsOpen(false);
                        }}
                        className={
                          slot.status === "AVAILABLE"
                            ? "w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-left text-[11px] text-emerald-900 hover:border-emerald-400"
                            : "w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-left text-[11px] text-stone-600"
                        }
                      >
                        <p className="font-semibold">
                          {fmtTime(slot.starts_at, slot.timezone)} –{" "}
                          {fmtTime(slot.ends_at, slot.timezone)}
                        </p>
                        <p>
                          {slot.status === "AVAILABLE"
                            ? "Libero"
                            : slot.status === "BOOKED"
                              ? "Prenotato"
                              : "Bloccato"}
                        </p>
                      </button>
                    ))
                  : null}
                {filter === "all" && freeSlots.length > 0 ? (
                  <p className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/70 px-2 py-1.5 text-[11px] text-emerald-800">
                    Libero 9–18 · {freeSlots.length}{" "}
                    {freeSlots.length === 1 ? "orario" : "orari"}
                  </p>
                ) : null}
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      setSelected({ kind: "event", event });
                      setActionsOpen(false);
                    }}
                    className={eventChipClass(event.event_type)}
                  >
                    <p className="font-semibold leading-snug">{event.title}</p>
                    <p>
                      {fmtTime(event.starts_at ?? event.due_at, event.timezone)} ·{" "}
                      {eventTypeLabel(event.event_type)}
                    </p>
                    {event.lead?.name ? (
                      <p className="truncate opacity-80">{event.lead.name}</p>
                    ) : null}
                  </button>
                ))}
                {!dayEvents.length &&
                (filter === "AVAILABILITY"
                  ? !daySlots.some(
                      (slot) =>
                        slot.status !== "AVAILABLE" ||
                        new Date(slot.starts_at).getTime() >= nowMs,
                    )
                  : filter === "all"
                    ? freeSlots.length === 0
                    : true) ? (
                  <p className="text-[11px] text-stone-400">
                    {workingDay ? "Nessun orario rimasto" : "Chiuso"}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Chiudi creazione"
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setCreateOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-stone-900">Aggiungi</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["APPOINTMENT", "Appuntamento"],
                    ["AVAILABILITY", "Disponibilità"],
                    ["WORK_DEADLINE", "Scadenza"],
                    ["REMINDER", "Promemoria"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCreateKind(value)}
                    className={
                      createKind === value
                        ? "rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white"
                        : "rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {createKind !== "AVAILABILITY" ? (
                <label className="block text-sm text-stone-700">
                  Titolo
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      createKind === "APPOINTMENT"
                        ? "Es. Demo · Attila-Lab"
                        : "Es. Consegna homepage"
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}

              <label className="block text-sm text-stone-700">
                {createKind === "AVAILABILITY" ? "Inizio" : "Quando"}
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => {
                    setWhen(e.target.value);
                    if (createKind === "AVAILABILITY") {
                      const end = new Date(e.target.value);
                      end.setMinutes(end.getMinutes() + 30);
                      setSlotEnd(toLocalInputValue(end));
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </label>

              {createKind === "AVAILABILITY" ? (
                <>
                  <label className="block text-sm text-stone-700">
                    Fine
                    <input
                      type="datetime-local"
                      value={slotEnd}
                      onChange={(e) => setSlotEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm text-stone-700">
                    Ripeti
                    <select
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    >
                      <option value={1}>Solo questa volta</option>
                      <option value={4}>Ogni settimana per 4 settimane</option>
                      <option value={8}>Ogni settimana per 8 settimane</option>
                      <option value={12}>Ogni settimana per 12 settimane</option>
                    </select>
                    <span className="mt-1 block text-xs text-stone-500">
                      Lun–ven 9–18 è già libero. Usa questo solo per un orario extra (sera o weekend).
                    </span>
                  </label>
                </>
              ) : null}

              {createKind === "APPOINTMENT" ? (
                <label className="block text-sm text-stone-700">
                  Collega a un contatto (opzionale)
                  <select
                    value={selectedContact}
                    onChange={(e) => setSelectedContact(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  >
                    <option value="">Nessun contatto</option>
                    {contactOptions.map((option) => (
                      <option key={option.leadId} value={option.leadId}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => void createItem()}
                className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Salvo…" : "Salva"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Chiudi dettaglio"
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => {
              setSelected(null);
              setActionsOpen(false);
            }}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-stone-200 bg-stone-50 shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  {selectedEvent
                    ? eventTypeLabel(selectedEvent.event_type)
                    : "Disponibilità"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-stone-900">
                  {selectedEvent
                    ? selectedEvent.title
                    : `Slot ${fmtTime(selectedSlot!.starts_at, selectedSlot!.timezone)}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setActionsOpen(false);
                }}
                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {selectedEvent ? (
                <>
                  <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Chi
                    </h3>
                    <p className="text-sm font-medium text-stone-900">
                      {selectedEvent.lead?.name ?? "Nessun contatto collegato"}
                    </p>
                    <p className="text-sm text-stone-600">
                      {channelLabel(selectedEvent.thread?.channel ?? null)}
                    </p>
                  </section>

                  <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Cosa
                    </h3>
                    <p className="text-sm text-stone-800">
                      {fmtDateTime(
                        selectedEvent.starts_at ?? selectedEvent.due_at,
                        selectedEvent.timezone,
                      )}
                    </p>
                    <p className="text-sm text-stone-600">
                      Stato: programmato · {sourceLabel(selectedEvent.source)}
                    </p>
                    {selectedEvent.description ? (
                      <p className="text-sm text-stone-600">{selectedEvent.description}</p>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Perché
                    </h3>
                    <p className="text-sm text-stone-800">
                      Stato commerciale:{" "}
                      {commercialLabel(selectedEvent.thread?.commercialState ?? null)}
                    </p>
                    <p className="text-sm text-stone-600">
                      Prossimo passo: {selectedEvent.thread?.nextStep ?? "—"}
                    </p>
                    {selectedEvent.thread?.preview ? (
                      <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                        Ultimo messaggio: {selectedEvent.thread.preview}
                      </p>
                    ) : (
                      <p className="text-sm text-stone-500">
                        Nessun messaggio recente collegato.
                      </p>
                    )}
                  </section>

                  <div className="space-y-2">
                    {openConversationUrl ? (
                      <a
                        href={openConversationUrl}
                        className="block rounded-lg bg-stone-900 px-4 py-2.5 text-center text-sm font-semibold text-white"
                      >
                        Apri conversazione
                      </a>
                    ) : (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Nessuna conversazione collegata a questo elemento.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setActionsOpen((open) => !open)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
                    >
                      {actionsOpen ? "Nascondi altre azioni" : "Altre azioni"}
                    </button>

                    {actionsOpen ? (
                      <div className="grid gap-2">
                        {selectedEvent.event_type === "APPOINTMENT" ? (
                          <>
                            <button
                              type="button"
                              disabled={busy || !selectedEvent.lead_id}
                              onClick={() => void mutateEvent(selectedEvent, "reschedule")}
                              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 disabled:opacity-40"
                            >
                              Riprogramma
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void mutateEvent(selectedEvent, "cancel")}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40"
                            >
                              Annulla
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void mutateEvent(selectedEvent, "complete")}
                              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 disabled:opacity-40"
                            >
                              Segna completato
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void mutateEvent(selectedEvent, "cancel")}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40"
                            >
                              Annulla
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : selectedSlot ? (
                <>
                  <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Disponibilità
                    </h3>
                    <p className="text-sm text-stone-800">
                      {fmtDateTime(selectedSlot.starts_at, selectedSlot.timezone)} –{" "}
                      {fmtTime(selectedSlot.ends_at, selectedSlot.timezone)}
                    </p>
                    <p className="text-sm text-stone-600">
                      Stato:{" "}
                      {selectedSlot.status === "AVAILABLE"
                        ? "Libero per Attila"
                        : selectedSlot.status === "BOOKED"
                          ? "Già prenotato"
                          : "Bloccato"}
                    </p>
                    {selectedSlot.note ? (
                      <p className="text-sm text-stone-600">{selectedSlot.note}</p>
                    ) : null}
                  </section>
                  {selectedSlot.status === "AVAILABLE" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteSlot(selectedSlot)}
                      className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-40"
                    >
                      Togli questo orario
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
