"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Briefing = {
  today: {
    appointments: number;
    nextAppointment: string | null;
    hotThreads: number;
    followUpsDue: number;
  };
  channels: {
    EMAIL: { replyRate: number };
    TELEGRAM: { replyRate: number };
  };
  recommendation: {
    channel: "EMAIL" | "TELEGRAM" | "BALANCED";
    market: string | null;
    city: string | null;
    readyLeads: number;
    reason: string;
  };
  actions: string[];
  summary: string;
};

type Goal = {
  id: string;
  title: string;
  target_metric: string;
  target_value: number;
  current_value: number;
  deadline: string;
  mode: "ASK" | "DO" | "AUTOPILOT";
  status: string;
  next_tick_at: string | null;
  progress_snapshot: {
    progressPct?: number;
    elapsedPct?: number;
    pace?: "AHEAD" | "ON_TRACK" | "BEHIND";
    blockers?: string[];
    funnel?: Record<string, number>;
  };
};

type GoalPlan = {
  version: number;
  rationale: string;
  actions: Array<{ id: string; type: string; rationale: string }>;
};

export default function CommercialInsightsCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [goalPlan, setGoalPlan] = useState<GoalPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState("10");
  const [offerKey, setOfferKey] = useState("siti web");
  const [city, setCity] = useState("");
  const [mode, setMode] = useState<Goal["mode"]>("DO");
  const [deadline, setDeadline] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  });

  useEffect(() => {
    void fetch("/api/ai/insights?days=30", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Insights non disponibili");
        setBriefing(data.briefing);
        setGoal(data.goal ?? null);
        setGoalPlan(data.goalPlan ?? null);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Centro commerciale non disponibile"),
      )
      .finally(() => setLoading(false));
  }, []);

  const updateGoal = async (payload: Record<string, string>) => {
    if (!goal || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: goal.id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Aggiornamento non riuscito");
      if (data.goal) setGoal(data.goal);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  };

  const createGoal = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetValue: Number(targetValue),
          offerKey,
          deadline: new Date(`${deadline}T23:59:59`).toISOString(),
          targetMetric: "DEALS_WON",
          mode,
          city: city.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Creazione obiettivo non riuscita");
      setGoal(data.goal);
      setGoalPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Creazione obiettivo non riuscita");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="animate-pulse rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="h-4 w-44 rounded bg-amber-200" />
        <div className="mt-3 h-7 w-3/4 rounded bg-amber-100" />
        <div className="mt-4 h-20 rounded-xl bg-white/70" />
      </section>
    );
  }

  if (!goal) {
    return (
      <section
        aria-label="Configura Attila Outcome"
        className="overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-stone-50"
      >
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              Prima configurazione · Attila Outcome
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              Quale risultato commerciale vuoi ottenere?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Imposta un risultato, non un workflow. Attila osserverà lead, demo, campagne,
              conversazioni e calendario e costruirà il piano.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-stone-700">
                Clienti da acquisire
                <input
                  value={targetValue}
                  onChange={(event) => setTargetValue(event.target.value)}
                  type="number"
                  min="1"
                  max="10000"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Cosa vuoi vendere
                <input
                  value={offerKey}
                  onChange={(event) => setOfferKey(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Mercato o città (facoltativo)
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Milano"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-stone-700">
                Scadenza
                <input
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  type="date"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Quanto può fare da solo?
            </p>
            <div className="mt-3 space-y-2">
              {([
                ["ASK", "Consiglia soltanto"],
                ["DO", "Prepara, confermo gli invii"],
                ["AUTOPILOT", "Avanza entro policy e limiti"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    mode === value
                      ? "border-amber-400 bg-amber-50 font-semibold text-amber-950"
                      : "border-stone-200 text-stone-700"
                  }`}
                >
                  <span className="block">{value}</span>
                  <span className="text-xs font-normal text-stone-500">{label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={
                busy ||
                !offerKey.trim() ||
                !deadline ||
                !Number.isFinite(Number(targetValue)) ||
                Number(targetValue) < 1
              }
              onClick={() => void createGoal()}
              className="mt-4 w-full rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Sto creando il piano…" : "Crea obiettivo e primo piano"}
            </button>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              AUTOPILOT nasce in shadow mode: prima pianifica e verifica, senza inviare.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const metrics = [
    ["Call oggi", briefing?.today.appointments ?? 0],
    ["Email reply", `${Math.round((briefing?.channels.EMAIL.replyRate ?? 0) * 100)}%`],
    ["Telegram reply", `${Math.round((briefing?.channels.TELEGRAM.replyRate ?? 0) * 100)}%`],
  ] as const;

  return (
    <section
      aria-label="Consigli di Attila"
      className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white"
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            Outcome commerciale · modalità {goal.mode}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-stone-950">
            {goal.title}
          </h2>
          {goal ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${Math.min(100, goal.progress_snapshot.progressPct ?? 0)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-stone-700">
                {goal.current_value}/{goal.target_value} {goal.target_metric.toLowerCase().replaceAll("_", " ")}
                {" · "}
                ritmo {goal.progress_snapshot.pace ?? "in osservazione"}
                {" · "}
                scadenza {new Date(goal.deadline).toLocaleDateString("it-IT")}
              </p>
              {goal.progress_snapshot.blockers?.length ? (
                <p className="mt-2 text-sm font-medium text-red-700">
                  Blocker: {goal.progress_snapshot.blockers.join(", ")}
                </p>
              ) : null}
              {goalPlan ? (
                <details className="mt-3 rounded-xl border border-amber-100 bg-white/70 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-stone-800">
                    Piano v{goalPlan.version}
                  </summary>
                  <p className="mt-2 text-stone-600">{goalPlan.rationale}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
                    {(Array.isArray(goalPlan.actions) ? goalPlan.actions : []).slice(0, 4).map((action) => (
                      <li key={action.id}>{action.rationale}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
          {briefing ? (
            <>
              <p className="mt-2 text-sm font-medium text-amber-900">
                Canale consigliato:{" "}
                {briefing.recommendation.channel === "BALANCED"
                  ? "Email + Telegram"
                  : briefing.recommendation.channel}
                {briefing.recommendation.city
                  ? ` · Nuove email: ${briefing.recommendation.city}`
                  : ""}
              </p>
              <ol className="mt-3 space-y-2">
                {briefing.actions.slice(0, 3).map((recommendation, index) => (
                  <li key={recommendation} className="flex gap-3 text-sm leading-6 text-stone-700">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-950">
                      {index + 1}
                    </span>
                    {recommendation}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {goal ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => updateGoal({ action: "tick" })}
                  className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Procedi
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    updateGoal({ action: goal.status === "PAUSED" ? "resume" : "pause" })
                  }
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50"
                >
                  {goal.status === "PAUSED" ? "Riprendi" : "Pausa"}
                </button>
                {(["ASK", "DO", "AUTOPILOT"] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    disabled={busy || goal.mode === mode}
                    onClick={() => updateGoal({ mode })}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
                  >
                    {mode}
                  </button>
                ))}
              </>
            ) : null}
            <Link
              href="/inbox"
              className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Gestisci priorità
            </Link>
            <Link
              href="/settings/playbook"
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
            >
              Modifica regole
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {(goal
            ? [
                ["Target", goal.target_value],
                ["Actual", goal.current_value],
                ["Progresso", `${goal.progress_snapshot.progressPct ?? 0}%`],
              ]
            : metrics
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-amber-100 bg-white/80 p-3">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-stone-950">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
