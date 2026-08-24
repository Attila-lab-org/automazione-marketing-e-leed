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
        <p className="text-sm text-stone-600">
          Seleziona i lead dalla tabella{" "}
          <Link href="/leads" className="font-medium text-amber-700 hover:underline">
            Lead
          </Link>{" "}
          e usa l&apos;azione bulk «Crea campagna». Qui trovi l&apos;elenco delle campagne
          operative.
        </p>

        <button
          type="button"
          onClick={() => setDevOpen((v) => !v)}
          className="mt-4 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          {devOpen ? "▾" : "▸"} Dev: UUIDs
        </button>

        {devOpen ? (
          <div className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4">
            <h2 className="text-sm font-semibold text-stone-800">Crea campagna (UUID)</h2>
            <p className="mt-1 text-xs text-stone-500">
              Solo per debug: incolla lead UUID separati da virgola.
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
                    className="font-semibold text-stone-900 hover:text-amber-800 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {c.mode} · {c.status}
                    {c.delivery_mode === "TEST" ? " · TEST" : ""} ·{" "}
                    {new Date(c.created_at).toLocaleString("it-IT")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="text-xs font-semibold text-stone-600 hover:underline"
                  >
                    Dettaglio
                  </Link>
                  <Link
                    href="/review-queue"
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Review →
                  </Link>
                </div>
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
