export type DecisionTraceStep = {
  id: string;
  timestampLabel?: string;
  /** Chi ha preso la decisione. */
  actor: "system" | "policy" | "user";
  /** Cosa è stato deciso, es. "Invio autorizzato". */
  decision: string;
  /** Perché: motivazione leggibile, es. "score 82 ≥ soglia 70 e confidence 0,9 ≥ 0,75". */
  reason: string;
};

export type DecisionTraceProps = {
  /** Sintesi in una frase: perché il sistema ha agito (§19.1). */
  summary: string;
  steps: DecisionTraceStep[];
  /** Versione della policy applicata (§4.1 policy snapshot). */
  policyVersion?: string;
};

const ACTOR_META: Record<
  DecisionTraceStep["actor"],
  { label: string; tooltip: string; className: string }
> = {
  system: {
    label: "Sistema",
    tooltip: "Decisione presa automaticamente dal motore di automazione.",
    className: "bg-stone-100 text-stone-600 border-stone-200",
  },
  policy: {
    label: "Policy",
    tooltip:
      "Decisione presa dal Policy Engine in base a score, confidence e soglie configurate (§5.2).",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  user: {
    label: "Utente",
    tooltip: "Decisione presa manualmente da un operatore.",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

/**
 * DecisionTrace — §21 inventory / §19.1.
 * Risponde alla domanda "perché il sistema ha agito?" con una catena di
 * decisioni motivata e auditabile.
 */
export default function DecisionTrace({
  summary,
  steps,
  policyVersion,
}: DecisionTraceProps) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <header className="border-b border-stone-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-stone-800">
          Decision Trace — perché il sistema ha agito
        </h3>
        <p className="mt-1 text-sm text-stone-500">{summary}</p>
        {policyVersion ? (
          <p className="mt-1 text-xs text-stone-400">
            Policy applicata:{" "}
            <span className="font-mono">{policyVersion}</span> (snapshot al
            momento della decisione, §4.1)
          </p>
        ) : null}
      </header>
      <ol className="divide-y divide-stone-100">
        {steps.map((step, index) => {
          const actor = ACTOR_META[step.actor];
          return (
            <li key={step.id} className="flex gap-4 px-5 py-3.5">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-500"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-stone-800">
                    {step.decision}
                  </p>
                  <span
                    title={actor.tooltip}
                    className={`cursor-help rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${actor.className}`}
                  >
                    {actor.label}
                  </span>
                  {step.timestampLabel ? (
                    <span className="text-xs tabular-nums text-stone-400">
                      {step.timestampLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-stone-500">{step.reason}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
