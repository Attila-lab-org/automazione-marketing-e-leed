"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/empty-state";
import { discoveryCategoryLabel } from "@/lib/leads/discovery-categories";

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

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/campaigns", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Impossibile caricare gli invii email");
    const loaded = data.campaigns ?? [];
    setCampaigns(loaded);
    return loaded;
  }

  useEffect(() => {
    void fetch("/api/campaigns", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Impossibile caricare gli invii email");
        setCampaigns(data.campaigns ?? []);
      })
      .catch((reason) =>
        setLoadError(reason instanceof Error ? reason.message : "Impossibile caricare gli invii email"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function deleteCampaign(campaign: Campaign) {
    if (
      !window.confirm(
        `Nascondere l’invio «${campaign.name}»? Sparisce dall’elenco. I solleciti si fermano. Le email già partite restano nel registro.`,
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
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Eliminazione fallita");
      setFeedback(`Invio «${campaign.name}» nascosto. Le email già partite restano nel registro.`);
      await load();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  async function archiveCampaign(campaign: Campaign) {
    if (
      !window.confirm(
        `Archiviare l’invio «${campaign.name}»? Sparisce dall’elenco attivo. I solleciti restano fermi.`,
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
      setFeedback(`Invio «${campaign.name}» archiviato. Lo trovi nella sezione Archivio.`);
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
      {loading ? <p className="text-sm text-stone-500">Caricamento invii email…</p> : null}
      {loadError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && campaigns.length ? (
        <>
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
            <label className="text-xs font-semibold text-stone-600">
              Cerca invio
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
                  <option key={item} value={item}>{discoveryCategoryLabel(item)}</option>
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
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-stone-900">Invii email creati</h2>
            <p className="text-xs text-stone-500">Ogni riga è un gruppo di invio, non una singola attività Google.</p>
          </div>
          <ul className="divide-y divide-stone-100">
            {visibleCampaigns.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/campaigns/${c.id}`}
                      title="Apri e controlla destinatari, messaggi e stato."
                      className="font-semibold text-stone-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {CAMPAIGN_STATUS[c.status] ?? c.status}
                    </span>
                    {c.delivery_mode === "TEST" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        Prova
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {c.lead_count} {c.lead_count === 1 ? "destinatario" : "destinatari"}
                    {" · "}
                    {c.status === "DRAFT"
                      ? "Prossimo passo: prepara e controlla i messaggi"
                      : c.status === "ACTIVE"
                        ? "Invio in corso"
                        : c.status === "PAUSED"
                          ? "In pausa"
                          : "Invio chiuso o fermo"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Apri invio
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void archiveCampaign(c)}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Archivia"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void deleteCampaign(c)}
                    className="text-xs font-semibold text-stone-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Elimina"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {visibleCampaigns.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500">
              Nessun invio corrisponde ai filtri scelti.
            </p>
          ) : null}
        </section>
        </>
      ) : !loading && !loadError ? (
        <EmptyState
          title="Nessun invio email creato"
          description="Apri Contatti, seleziona i destinatari e crea il primo invio email."
          nextAction={{ label: "Vai ai contatti", href: "/leads" }}
        />
      ) : null}
    </div>
  );
}
