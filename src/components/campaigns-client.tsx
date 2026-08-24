"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";

type Campaign = { id: string; name: string; status: string; mode: string; created_at: string };

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leadIds, setLeadIds] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage("Inserisci nome campagna e almeno un lead ID.");
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
      setMessage(`Campagna creata con ${data.leadCount} lead — preparazione avviata.`);
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
        <h2 className="text-sm font-semibold text-stone-800">Crea campagna bulk</h2>
        <p className="mt-1 text-sm text-stone-500">
          Seleziona lead (UUID separati da virgola). La preparazione esegue enrichment, demo V2 e bozza email in coda job.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
          disabled={busy}
          onClick={createCampaign}
          className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? "Creazione…" : "Crea e prepara campagna"}
        </button>
        {message ? <p className="mt-2 text-sm text-stone-600">{message}</p> : null}
      </section>

      {campaigns.length ? (
        <section className="rounded-xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-4 text-sm">
                <div>
                  <p className="font-semibold text-stone-900">{c.name}</p>
                  <p className="text-xs text-stone-500">
                    {c.mode} · {c.status} · {new Date(c.created_at).toLocaleString("it-IT")}
                  </p>
                </div>
                <a href="/review-queue" className="text-xs font-semibold text-amber-700 hover:underline">
                  Review →
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title="Nessuna campagna"
          description="Crea la prima campagna selezionando lead qualificati dalla tabella Lead."
          nextAction={{ label: "Apri Lead", href: "/leads" }}
        />
      )}
    </div>
  );
}
