export type PolicyMode = "MANUAL" | "SCORE_BASED" | "FULL_AUTO";

export type PolicyBadgeProps = {
  mode: PolicyMode;
  size?: "sm" | "md";
};

const POLICY_META: Record<
  PolicyMode,
  {
    label: string;
    tooltip: string;
    className: string;
    dotClassName: string;
    pulse: boolean;
  }
> = {
  MANUAL: {
    label: "Manuale",
    tooltip:
      "Modalità MANUAL: demo e messaggi possono essere generati automaticamente, ma ogni invio richiede approvazione umana (§4).",
    className: "border-stone-300 bg-stone-100 text-stone-700",
    dotClassName: "bg-stone-500",
    pulse: false,
  },
  SCORE_BASED: {
    label: "Score-Based",
    tooltip:
      "Modalità SCORE_BASED: i gate si aprono solo quando score e confidence superano le soglie definite; la fascia intermedia va in Review Queue (§4).",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-500",
    pulse: false,
  },
  FULL_AUTO: {
    label: "Full Auto",
    tooltip:
      "Modalità FULL_AUTO: pipeline completa senza blocchi manuali, sempre con preview, rate limit, Send Guard e kill switch (§4). Eliminato il click di approvazione, non la verifica.",
    className: "border-emerald-400 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
    pulse: true,
  },
};

/**
 * PolicyBadge — §21 inventory.
 * Sempre visibile dove una policy governa l'operatività; Full Auto è
 * accompagnato da un indicatore pulsante per essere riconoscibile a colpo
 * d'occhio (§21.1).
 */
export default function PolicyBadge({ mode, size = "md" }: PolicyBadgeProps) {
  const meta = POLICY_META[mode];
  const sizing =
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      title={meta.tooltip}
      aria-label={`Policy operativa: ${meta.label}. ${meta.tooltip}`}
      className={`inline-flex cursor-help items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${meta.className} ${sizing}`}
    >
      <span className="relative flex h-2 w-2">
        {meta.pulse ? (
          <span
            aria-hidden
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dotClassName}`}
          />
        ) : null}
        <span
          aria-hidden
          className={`relative inline-flex h-2 w-2 rounded-full ${meta.dotClassName}`}
        />
      </span>
      {meta.label}
    </span>
  );
}
