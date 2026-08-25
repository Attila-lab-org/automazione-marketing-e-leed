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

export default function CommercialInsightsCard() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  useEffect(() => {
    void fetch("/api/ai/insights?days=30", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Insights non disponibili");
        setInsights(data.insights);
        setBriefing(data.briefing);
      })
      .catch(() => setInsights(null));
  }, []);

  if (!insights || !briefing) return null;

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
            Attila ha analizzato gli ultimi {insights.windowDays} giorni
          </p>
          <h2 className="mt-2 text-lg font-semibold text-stone-950">{briefing.summary}</h2>
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
          {metrics.map(([label, value]) => (
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
