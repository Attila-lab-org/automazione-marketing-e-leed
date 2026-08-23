export type ProviderHealth =
  | "ok"
  | "mock"
  | "degraded"
  | "down"
  | "not_configured"
  | "error";

export type ProviderStatusProps = {
  /** Nome del provider, es. "Google Places", "Resend". */
  name: string;
  status: ProviderHealth;
  /** Tooltip: cosa significa lo stato e cosa fare (§21.1). */
  tooltip: string;
  /** Dettaglio opzionale, es. "mock mode" o "ultimo errore: timeout". */
  detail?: string;
  /** Etichetta ultimo controllo, es. "verificato 5 min fa". */
  lastCheckLabel?: string;
};

const STATUS_META: Record<
  ProviderHealth,
  { label: string; dot: string; text: string }
> = {
  ok: { label: "READY", dot: "bg-emerald-500", text: "text-emerald-700" },
  mock: { label: "MOCK", dot: "bg-sky-500", text: "text-sky-700" },
  degraded: { label: "Degradato", dot: "bg-amber-500", text: "text-amber-700" },
  down: {
    label: "Non raggiungibile",
    dot: "bg-red-500",
    text: "text-red-700",
  },
  error: { label: "ERROR", dot: "bg-red-500", text: "text-red-700" },
  not_configured: {
    label: "Non configurato",
    dot: "bg-stone-400",
    text: "text-stone-500",
  },
};

/**
 * ProviderStatus — §21 inventory.
 * Semaforo sulla salute e configurazione dei provider esterni.
 */
export default function ProviderStatus({
  name,
  status,
  tooltip,
  detail,
  lastCheckLabel,
}: ProviderStatusProps) {
  const meta = STATUS_META[status];

  return (
    <div
      title={tooltip}
      aria-label={`${name}: ${meta.label}. ${tooltip}`}
      className="flex cursor-help items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {status === "degraded" ? (
          <span
            aria-hidden
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`}
          />
        ) : null}
        <span
          aria-hidden
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`}
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stone-800">{name}</p>
        <p className={`text-xs font-medium ${meta.text}`}>
          {meta.label}
          {detail ? (
            <span className="font-normal text-stone-400"> · {detail}</span>
          ) : null}
        </p>
      </div>
      {lastCheckLabel ? (
        <span className="ml-auto shrink-0 text-[11px] text-stone-400">
          {lastCheckLabel}
        </span>
      ) : null}
    </div>
  );
}

/** Mappa status runtime API → visual health. */
export function mapRuntimeStatus(
  status: "ready" | "mock" | "error" | "not_configured",
): ProviderHealth {
  switch (status) {
    case "ready":
      return "ok";
    case "mock":
      return "mock";
    case "error":
      return "error";
    default:
      return "not_configured";
  }
}
