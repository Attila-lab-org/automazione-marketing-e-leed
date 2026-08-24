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
  const [leadIds, setLeadIds] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(data.campaigns ?? []));
  }, []);

  async function createCampaign() {
    const ids = leadIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || !ids.length) {
      setMessage("Inserisci il nome della campagna e almeno un’attività.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), leadIds: ids, prepare: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore creazione");
      setMessage(`Campagna creata con ${data.leadCount} attività. Preparazione avviata.`);
      setName("");
      setLeadIds("");
      const list = await fetch("/api/campaigns").then((r) => r.json());
      setCampaigns(list.campaigns ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <p className="text-sm text-stone-600">
          Seleziona le attività dalla pagina{" "}
          <Link href="/leads" className="font-medium text-amber-700 hover:underline">
            Attività
          </Link>{" "}
          e scegli «Crea campagna». Qui trovi tutte le campagne già create.
        </p>

        <button
          type="button"
          title="Apre gli strumenti tecnici per creare una campagna usando gli identificativi interni."
          onClick={() => setDevOpen((v) => !v)}
          className="mt-4 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          {devOpen ? "▾" : "▸"} Strumenti tecnici
        </button>

        {devOpen ? (
          <div className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4">
            <h2 className="text-sm font-semibold text-stone-800">Crea campagna (UUID)</h2>
            <p className="mt-1 text-xs text-stone-500">
              Solo per assistenza tecnica: incolla gli identificativi delle attività separati da virgola.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
                placeholder="Nome campagna"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm md:col-span-2"
                placeholder="Lead IDs (uuid1, uuid2, …)"
                rows={3}
                value={leadIds}
                onChange={(e) => setLeadIds(e.target.value)}
              />
            </div>
            <button
              type="button"
              title="Crea la campagna e prepara automaticamente anteprime e messaggi. Non invia email."
              disabled={busy}
              onClick={createCampaign}
              className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {busy ? "Creazione…" : "Crea e prepara campagna"}
            </button>
            {message ? <p className="mt-2 text-sm text-stone-600">{message}</p> : null}
          </div>
        ) : null}
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
