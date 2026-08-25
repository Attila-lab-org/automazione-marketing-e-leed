"use client";

import { useEffect, useState } from "react";
import KpiCard from "@/components/kpi-card";

type AiStats = {
  spendUsd: number;
  analyzedLeads: number;
  aiWrittenMessages: number;
  criticPass: number;
  aiReplies: number;
  humanHandoffs: number;
};

export default function AiKpiCards() {
  const [stats, setStats] = useState<AiStats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/ai-stats")
      .then((r) => r.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Spesa AI"
        value={stats ? `${stats.spendUsd.toFixed(2)} USD` : "—"}
        tooltip="Costo stimato delle chiamate AI registrate in ai_runs."
      />
      <KpiCard
        label="Siti analizzati"
        value={String(stats?.analyzedLeads ?? "—")}
        tooltip="Analisi sito salvate. Zero se ancora non eseguite."
      />
      <KpiCard
        label="Email scritte dall’AI"
        value={String(stats?.aiWrittenMessages ?? "—")}
        tooltip="Bozze outbound generate dall’AI (prima del Send Guard)."
      />
      <KpiCard
        label="Controlli critic"
        value={String(stats?.criticPass ?? "—")}
        tooltip="Esecuzioni del critic sulle bozze verso i prospect."
      />
      <KpiCard
        label="Bozze di risposta"
        value={String(stats?.aiReplies ?? "—")}
        tooltip="Risposte AI classificate/bozzate su Sales Thread."
      />
      <KpiCard
        label="Handoff umani"
        value={String(stats?.humanHandoffs ?? "—")}
        tooltip="Conversazioni in stato HUMAN_REQUIRED."
        accent="amber"
      />
    </div>
  );
}
