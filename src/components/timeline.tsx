export type TimelineEvent = {
  id: string;
  /** Etichetta temporale già formattata, es. "12 mag, 14:32". */
  timestampLabel: string;
  /** Evento commerciale o tecnico (§7.2 tab Timeline). */
  type: "business" | "technical";
  title: string;
  description?: string;
};

export type TimelineProps = {
  events: TimelineEvent[];
  /** Messaggio quando non ci sono eventi. */
  emptyLabel?: string;
};

const TYPE_META: Record<
  TimelineEvent["type"],
  { label: string; dot: string; badge: string }
> = {
  business: {
    label: "Evento commerciale",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
  },
  technical: {
    label: "Evento tecnico",
    dot: "bg-stone-400",
    badge: "bg-stone-100 text-stone-600 border-stone-200",
  },
};

/**
 * Timeline — §21 inventory.
 * Eventi business + tecnici in ordine cronologico inverso, ciascuno con
 * label leggibile e tooltip sul tipo (§21.1).
 */
export default function Timeline({
  events,
  emptyLabel = "Nessun evento registrato finora.",
}: TimelineProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className="relative space-y-5 border-l border-stone-200 pl-6">
      {events.map((event) => {
        const meta = TYPE_META[event.type];
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${meta.dot}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-stone-800">
                {event.title}
              </p>
              <span
                title={meta.label}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.badge}`}
              >
                {event.type === "business" ? "Business" : "Tecnico"}
              </span>
            </div>
            {event.description ? (
              <p className="mt-0.5 text-sm text-stone-500">
                {event.description}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs tabular-nums text-stone-400">
              {event.timestampLabel}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
