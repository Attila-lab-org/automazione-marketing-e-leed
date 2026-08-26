"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Insights = {
  windowDays: number;
  metrics: {
    inboundClassified: number;
    pricingRequests: number;
    appointmentsBooked: number;
    proactiveFollowUps: number;
    ownerCtaClicks: number;
  };
  recommendations: string[];
};

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
  const [insights, setInsights] = useState<Insights | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [goalPlan, setGoalPlan] = useState<GoalPlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/ai/insights?days=30", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Insights non disponibili");
        setInsights(data.insights);
        setBriefing(data.briefing);
        setGoal(data.goal ?? null);
        setGoalPlan(data.goalPlan ?? null);
      })
      .catch(() => setInsights(null));
  }, []);

  if (!insights || !briefing) return null;

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
      if (data.goal) setGoal(data.goal);
    } finally {
      setBusy(false);
    }
  };

  const metrics = [
    ["Call oggi", briefing.today.appointments],
    ["Email reply", `${Math.round(briefing.channels.EMAIL.replyRate * 100)}%`],
    ["Telegram reply", `${Math.round(briefing.channels.TELEGRAM.replyRate * 100)}%`],
  ] as const;

  return (
    <section
      aria-label="Consigli di Attila"
      className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white"
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            {goal ? `Outcome commerciale · modalità ${goal.mode}` : `Attila ha analizzato gli ultimi ${insights.windowDays} giorni`}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-stone-950">
            {goal ? goal.title : briefing.summary}
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
                  onClick={() => updateGoal({ action: "pause" })}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50"
                >
                  Pausa
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
