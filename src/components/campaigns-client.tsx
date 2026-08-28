"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/empty-state";

type Campaign = {
  id: string;
  name: string;
  status: string;
  mode: string;
  delivery_mode?: string;
  created_at: string;
  lead_count: number;
  categories: string[];
};

const CAMPAIGN_STATUS: Record<string, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attiva",
  PAUSED: "In pausa",
  COMPLETED: "Completata",
  STOPPED: "Fermata",
  ARCHIVED: "Archiviata",
};

const CAMPAIGN_MODE: Record<string, string> = {
  MANUAL: "Controllo manuale",
  SCORE_BASED: "In base al punteggio",
  FULL_AUTO: "Completamente automatica",
};

function categoryLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("it-IT"));
}

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/campaigns");
    const data = await response.json();
    setCampaigns(data.campaigns ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function archiveCampaign(campaign: Campaign) {
    if (
      !window.confirm(
        `Archiviare «${campaign.name}»? Sparisce dall’elenco attivo. I follow-up restano fermi.`,
      )
    ) {
      return;
    }
    setBusyId(campaign.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Archiviazione fallita");
      setFeedback(`Campagna «${campaign.name}» archiviata.`);
      await load();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  const categories = useMemo(
    () => [...new Set(campaigns.flatMap((campaign) => campaign.categories))].sort(),
    [campaigns],
  );
  const visibleCampaigns = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("it-IT");
    return campaigns.filter((campaign) => {
      if (status && campaign.status !== status) return false;
      if (category && !campaign.categories.includes(category)) return false;
      if (
        search &&
        !`${campaign.name} ${campaign.categories.join(" ")}`
          .toLocaleLowerCase("it-IT")
          .includes(search)
      ) {
        return false;
      }
      return true;
    });
  }, [campaigns, query, category, status]);

  return (
    <div className="space-y-6">
      {feedback ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {feedback}
        </p>
      ) : null}
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
        <>
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
            <label className="text-xs font-semibold text-stone-600">
              Cerca campagna
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome o categoria…"
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600">
              Categoria
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal"
              >
                <option value="">Tutte le categorie</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{categoryLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-stone-600">
              Stato
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal"
              >
                <option value="">Tutti gli stati</option>
                {Object.entries(CAMPAIGN_STATUS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {query || category || status ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setStatus("");
                }}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700"
              >
                Azzera
              </button>
            ) : <span />}
          </div>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {visibleCampaigns.map((c) => (
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      {c.lead_count} {c.lead_count === 1 ? "contatto" : "contatti"}
                    </span>
                    {c.categories.slice(0, 3).map((item) => (
                      <span key={item} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        {categoryLabel(item)}
                      </span>
                    ))}
                    {c.categories.length > 3 ? (
                      <span className="text-[11px] text-stone-500">+{c.categories.length - 3}</span>
                    ) : null}
                  </div>
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
                    href="/follow-ups"
                    title="Vai ai follow-up di questa e altre campagne."
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Follow-up
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void archiveCampaign(c)}
                    className="text-xs font-semibold text-stone-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Archivia"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {visibleCampaigns.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500">
              Nessuna campagna corrisponde ai filtri scelti.
            </p>
          ) : null}
        </section>
        </>
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
