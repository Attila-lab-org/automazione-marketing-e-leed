"use client";

import { useEffect, useState } from "react";
import KpiCard from "@/components/kpi-card";

type Stats = {
  leadsTotal: number;
  leadsQualified: number;
  campaignsActive: number;
  demosReady: number;
  emailsQueued: number;
  emailsSent: number;
  replies: number;
  hotInterested: number;
};

export default function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => setStats(data.stats ?? null))
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Lead trovati" value={String(stats?.leadsTotal ?? "—")} tooltip="Lead in Supabase" drilldownHref="/leads" />
      <KpiCard label="Qualificati" value={String(stats?.leadsQualified ?? "—")} tooltip="PREQUALIFIED o QUALIFIED" drilldownHref="/segments" accent="amber" />
      <KpiCard label="Campagne attive" value={String(stats?.campaignsActive ?? "—")} tooltip="Campagne in stato ACTIVE" drilldownHref="/campaigns" />
      <KpiCard label="Demo pronte" value={String(stats?.demosReady ?? "—")} tooltip="Campaign leads con demo collegata" drilldownHref="/demos" accent="green" />
      <KpiCard label="Email in coda" value={String(stats?.emailsQueued ?? "—")} tooltip="Bozze pronte o approvate" drilldownHref="/review-queue" />
      <KpiCard label="Email inviate" value={String(stats?.emailsSent ?? "—")} tooltip="Messaggi inviati (mock o live)" drilldownHref="/analytics" accent="red" />
      <KpiCard label="Risposte" value={String(stats?.replies ?? "—")} tooltip="Eventi REPLIED registrati" drilldownHref="/inbox" />
      <KpiCard label="Hot / interessati" value={String(stats?.hotInterested ?? "—")} tooltip="Lead INTERESTED o HOT" drilldownHref="/leads" accent="amber" />
    </div>
  );
}
