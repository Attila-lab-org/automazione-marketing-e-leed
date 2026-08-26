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
      <KpiCard label="Attività trovate" value={String(stats?.leadsTotal ?? "—")} tooltip="Tutte le attività presenti nella tua lista." drilldownHref="/leads" />
      <KpiCard label="Buone opportunità" value={String(stats?.leadsQualified ?? "—")} tooltip="Attività con dati e punteggio sufficienti per essere considerate interessanti." drilldownHref="/leads?view=opportunita" accent="amber" />
      <KpiCard label="Campagne attive" value={String(stats?.campaignsActive ?? "—")} tooltip="Campagne che stanno preparando contenuti o hanno invii in corso." drilldownHref="/campaigns" />
      <KpiCard label="Anteprime pronte" value={String(stats?.demosReady ?? "—")} tooltip="Attività per cui è già stato creato un sito dimostrativo." drilldownHref="/demos" accent="green" />
      <KpiCard label="Email da inviare" value={String(stats?.emailsQueued ?? "—")} tooltip="Messaggi preparati o approvati che non sono ancora stati inviati." drilldownHref="/review-queue" />
      <KpiCard label="Email inviate" value={String(stats?.emailsSent ?? "—")} tooltip="Numero totale di messaggi inviati dal sistema." drilldownHref="/inbox" accent="red" />
      <KpiCard label="Risposte" value={String(stats?.replies ?? "—")} tooltip="Numero di risposte ricevute dai clienti." drilldownHref="/inbox" />
      <KpiCard label="Clienti interessati" value={String(stats?.hotInterested ?? "—")} tooltip="Attività che hanno mostrato interesse o sono vicine alla conversione." drilldownHref="/leads" accent="amber" />
    </div>
  );
}
