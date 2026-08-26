"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";

type Campaign = {
  id: string;
  name: string;
  status: string;
  mode: string;
  delivery_mode?: string;
  created_at: string;
};

const CAMPAIGN_STATUS: Record<string, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attiva",
  PAUSED: "In pausa",
  COMPLETED: "Completata",
  STOPPED: "Fermata",
};

const CAMPAIGN_MODE: Record<string, string> = {
  MANUAL: "Controllo manuale",
  SCORE_BASED: "In base al punteggio",
  FULL_AUTO: "Completamente automatica",
};

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(data.campaigns ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-stone-900">Vuoi creare una nuova campagna?</h2>
          <p className="mt-1 text-sm text-stone-600">
            Cerca i possibili clienti, seleziona quelli giusti e premi “Crea campagna”.
          </p>
        </div>
        <Link
          href="/leads"
          className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-stone-800"
        >
          Cerca e seleziona contatti
        </Link>
      </section>

      {campaigns.length ? (
        <section className="rounded-xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-4 text-sm">
                <div>
                  <Link
                    href={`/campaigns/${c.id}`}
                    title="Apri la campagna e controlla stato, attività e invii."
                    className="font-semibold text-stone-900 hover:text-amber-800 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {CAMPAIGN_MODE[c.mode] ?? c.mode} · {CAMPAIGN_STATUS[c.status] ?? c.status}
                    {c.delivery_mode === "TEST" ? " · PROVA" : ""} ·{" "}
                    {new Date(c.created_at).toLocaleString("it-IT")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/campaigns/${c.id}`}
                    title="Apri tutti i dettagli della campagna."
                    className="text-xs font-semibold text-stone-600 hover:underline"
                  >
                    Dettaglio
                  </Link>
                  <Link
                    href="/review-queue"
                    title="Vai agli elementi da controllare prima dell'invio."
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Da controllare →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title="Nessuna campagna"
          description="Crea la prima campagna selezionando le attività più interessanti dalla pagina Attività."
          nextAction={{ label: "Apri attività", href: "/leads" }}
        />
      )}
    </div>
  );
}
