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

export default function CommercialInsightsCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
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

  return (
    <section
      aria-label="Consigli di Attila"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Obiettivo attuale</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">{goal.title}</h2>
          <p className="mt-1 text-sm text-stone-700">
            <strong>{goal.current_value} di {goal.target_value}</strong> · scadenza{" "}
            {new Date(goal.deadline).toLocaleDateString("it-IT")}
          </p>
        </div>
        <p className="text-2xl font-semibold text-stone-950">
          {Math.round(goal.progress_snapshot.progressPct ?? 0)}%
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, goal.progress_snapshot.progressPct ?? 0)}%` }} />
      </div>
      {briefing?.actions[0] ? (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-stone-700">
          <strong>Attila consiglia:</strong> {briefing.actions[0]}
        </p>
      ) : null}
      {goal.progress_snapshot.blockers?.[0] ? (
        <p className="mt-2 text-sm font-medium text-red-700">{goal.progress_snapshot.blockers[0]}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => updateGoal({ action: "tick" })} className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Procedi
        </button>
        {([
          ["ASK", "Consiglia"],
          ["DO", "Prepara"],
          ["AUTOPILOT", "Autonomo"],
        ] as const).map(([value, label]) => (
          <button type="button" key={value} disabled={busy || goal.mode === value} onClick={() => updateGoal({ mode: value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:bg-amber-200">
            {label}
          </button>
        ))}
        <Link href="/inbox" className="ml-auto text-xs font-semibold text-amber-900 hover:underline">
          Apri conversazioni →
        </Link>
      </div>
    </section>
  );
}
