import Link from "next/link";
import InfoTip from "./info-tip";

export type KpiCardProps = {
  /** Nome della metrica, in linguaggio operativo. */
  label: string;
  /** Valore corrente (stringa già formattata o numero). */
  value: string | number;
  /** Tooltip: spiega come viene calcolata la metrica (§21.1). */
  tooltip: string;
  /** Trend rispetto al periodo precedente. */
  trend?: {
    /** Es. "+12%" oppure "—" */
    delta: string;
    direction: "up" | "down" | "flat";
    /** Es. "vs 7 giorni precedenti" */
    label?: string;
  };
  /** Link di drilldown verso la sezione di dettaglio. */
  drilldownHref?: string;
  /** Accento cromatico caldo/neutro. */
  accent?: "default" | "amber" | "green" | "red";
};

const TREND_STYLES: Record<
  NonNullable<KpiCardProps["trend"]>["direction"],
  { className: string; arrow: string }
> = {
  up: { className: "text-emerald-700 bg-emerald-50", arrow: "↑" },
  down: { className: "text-red-700 bg-red-50", arrow: "↓" },
  flat: { className: "text-stone-500 bg-stone-100", arrow: "→" },
};

const ACCENT_BAR: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  default: "bg-stone-300",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
  red: "bg-red-500",
};

/**
 * KpiCard — §21 inventory.
 * Metrica con trend leggibile e drilldown opzionale.
 */
export default function KpiCard({
  label,
  value,
  tooltip,
  trend,
  drilldownHref,
  accent = "default",
}: KpiCardProps) {
  const trendStyle = trend ? TREND_STYLES[trend.direction] : null;

  const body = (
    <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-5">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`}
      />
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          {label}
        </p>
        <InfoTip text={tooltip} label={`Spiegazione di ${label}`} />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-stone-900">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend && trendStyle ? (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${trendStyle.className}`}
            >
              <span aria-hidden>{trendStyle.arrow}</span>
              {trend.delta}
            </span>
            {trend.label ? (
              <span className="text-stone-400">{trend.label}</span>
            ) : null}
          </>
        ) : (
          <span className="text-stone-400">Nessun dato nel periodo</span>
        )}
      </div>
      {drilldownHref ? (
        <span className="mt-3 inline-block text-xs font-medium text-amber-700">
          Vedi dettaglio →
        </span>
      ) : null}
    </div>
  );

  if (drilldownHref) {
    return (
      <Link
        href={drilldownHref}
        title={`${tooltip} Apri la pagina con i dettagli.`}
        className="block transition-shadow hover:shadow-sm"
      >
        {body}
      </Link>
    );
  }
  return (
    <div title={tooltip} tabIndex={0} className="rounded-xl outline-none focus:ring-2 focus:ring-amber-200">
      {body}
    </div>
  );
}
