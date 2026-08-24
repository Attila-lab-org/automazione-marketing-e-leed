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
    label: "Controllo manuale",
    tooltip:
      "Il sistema prepara anteprime e messaggi, ma nessuna email parte finché non la approvi tu.",
    className: "border-stone-300 bg-stone-100 text-stone-700",
    dotClassName: "bg-stone-500",
    pulse: false,
  },
  SCORE_BASED: {
    label: "In base al punteggio",
    tooltip:
      "Il sistema propone automaticamente le attività con dati sufficienti. I casi dubbi restano da controllare.",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-500",
    pulse: false,
  },
  FULL_AUTO: {
    label: "Completamente automatica",
    tooltip:
      "Il sistema prepara e avvia le attività senza approvazione manuale. I controlli di sicurezza restano sempre attivi.",
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
      aria-label={`Modalità operativa: ${meta.label}. ${meta.tooltip}`}
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
