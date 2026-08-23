export type ScoreBreakdownItem = {
  /** Nome della dimensione di scoring (§5.1), es. "Presenza digitale". */
  label: string;
  /** Contributo 0-100 della dimensione. */
  value: number;
};

export type ScoreBadgeProps = {
  /** Score composito 0-100 (§5.1). */
  score: number;
  /** Confidence 0-1 della stima. */
  confidence: number;
  /** Breakdown per dimensione, mostrato nel tooltip/hover panel. */
  breakdown?: ScoreBreakdownItem[];
};

function band(score: number): {
  label: string;
  className: string;
  barClassName: string;
} {
  if (score >= 75) {
    return {
      label: "Alto",
      className: "border-emerald-300 bg-emerald-50 text-emerald-800",
      barClassName: "bg-emerald-500",
    };
  }
  if (score >= 50) {
    return {
      label: "Medio",
      className: "border-amber-300 bg-amber-50 text-amber-800",
      barClassName: "bg-amber-500",
    };
  }
  return {
    label: "Basso",
    className: "border-stone-300 bg-stone-100 text-stone-600",
    barClassName: "bg-stone-400",
  };
}

/**
 * ScoreBadge — §21 inventory.
 * Mostra score + confidence; in hover/focus un pannello con il breakdown
 * delle dimensioni (§5.1). Tooltip solo CSS: nessun JS richiesto.
 */
export default function ScoreBadge({
  score,
  confidence,
  breakdown,
}: ScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const confidencePct = Math.round(
    Math.max(0, Math.min(1, confidence)) * 100,
  );
  const b = band(clamped);
  const tooltipText = `Score ${clamped}/100 (${b.label}) con confidence ${confidencePct}%. Lo score misura quanto il lead è promettente; la confidence quanto la stima è affidabile (§5.1).`;

  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <span
        title={tooltipText}
        className={`inline-flex cursor-help items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold tabular-nums ${b.className}`}
      >
        {clamped}
        <span className="font-normal opacity-75">/100</span>
        <span
          aria-hidden
          className="mx-0.5 h-3 w-px bg-current opacity-30"
        />
        <span className="font-normal" title={`Confidence: ${confidencePct}%`}>
          {confidencePct}%
        </span>
      </span>

      {breakdown && breakdown.length > 0 ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-64 rounded-lg border border-stone-200 bg-white p-3 text-left shadow-lg group-hover:block group-focus-within:block"
        >
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Breakdown score (§5.1)
          </span>
          {breakdown.map((item) => (
            <span key={item.label} className="mb-1.5 block last:mb-0">
              <span className="flex justify-between text-xs text-stone-600">
                <span>{item.label}</span>
                <span className="tabular-nums font-medium">{item.value}</span>
              </span>
              <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <span
                  className={`block h-full rounded-full ${b.barClassName}`}
                  style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }}
                />
              </span>
            </span>
          ))}
          <span className="mt-2 block border-t border-stone-100 pt-2 text-[11px] text-stone-400">
            Confidence {confidencePct}% — sotto soglia va in Review Queue.
          </span>
        </span>
      ) : null}
    </span>
  );
}
