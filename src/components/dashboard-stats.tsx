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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Possibili clienti" value={String(stats?.leadsTotal ?? "—")} tooltip="Tutti i contatti presenti nella tua lista." drilldownHref="/leads" />
      <KpiCard label="Campagne attive" value={String(stats?.campaignsActive ?? "—")} tooltip="Campagne che stanno preparando contenuti o hanno invii in corso." drilldownHref="/campaigns" />
      <KpiCard label="Risposte" value={String(stats?.replies ?? "—")} tooltip="Numero di risposte ricevute dai clienti." drilldownHref="/inbox" />
      <KpiCard label="Clienti interessati" value={String(stats?.hotInterested ?? "—")} tooltip="Attività che hanno mostrato interesse o sono vicine alla conversione." drilldownHref="/leads" accent="amber" />
    </div>
  );
}
