"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CampaignDetail = {
  id: string;
  name: string;
  status: string;
  mode: string;
  created_at: string;
  updated_at?: string;
  rate_limit_per_hour?: number;
  daily_send_limit?: number;
};

type Totals = {
  leads: number;
  review: number;
  ready: number;
  approved: number;
  pending: number;
  generating: number;
  failed: number;
  skipped: number;
  sent: number;
};

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Campagna non trovata");
        if (cancelled) return;
        setCampaign(data.campaign);
        setCounts(data.counts ?? {});
        setTotals(data.totals ?? null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Campagna non trovata");
    setCampaign(data.campaign);
    setCounts(data.counts ?? {});
    setTotals(data.totals ?? null);
  }, [campaignId]);
  async function runAction(action: "prepare" | "approve" | "pause") {
    if (action === "approve") {
      const n = (totals?.review ?? 0) + (totals?.ready ?? 0);
      const ok = window.confirm(
        `Approvare e avviare l'invio per i lead in REVIEW/READY di questa campagna${
          n ? ` (${n})` : ""
        }?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Azione fallita");
      if (action === "prepare") {
        setMessage(
          typeof data.enqueued === "number"
            ? `Preparazione avviata: ${data.enqueued} job in coda.`
            : "Preparazione avviata.",
        );
      } else if (action === "approve") {
        setMessage(`Approvati ${data.approved ?? 0} lead — invio in coda.`);
      } else {
        setMessage("Campagna in pausa.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (error && !campaign) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!campaign || !totals) {
    return <p className="text-sm text-stone-500">Caricamento campagna…</p>;
  }

  const statCards: { label: string; value: number }[] = [
    { label: "Totale lead", value: totals.leads },
    { label: "Pending", value: totals.pending },
    { label: "In generazione", value: totals.generating },
    { label: "In review", value: totals.review },
    { label: "Ready", value: totals.ready },
    { label: "Approvati", value: totals.approved },
    { label: "Inviati", value: totals.sent },
    { label: "Falliti", value: totals.failed },
    { label: "Saltati", value: totals.skipped },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              {campaign.mode} · {campaign.status}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-900">{campaign.name}</h2>
            <p className="mt-1 text-sm text-stone-500">
              Creata {new Date(campaign.created_at).toLocaleString("it-IT")}
            </p>
          </div>
          <Link href="/campaigns" className="text-sm text-stone-500 hover:text-stone-800">
            ← Tutte le campagne
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("prepare")}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            Prepara
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => router.push("/review-queue")}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Revisiona
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("approve")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Approva e avvia
          </button>
          <button
            type="button"
            disabled={busy || campaign.status === "PAUSED"}
            onClick={() => void runAction("pause")}
            className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
          >
            Pausa
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-stone-200 bg-white px-4 py-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {Object.keys(counts).length > 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-stone-800">Conteggi per stato</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(counts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([status, n]) => (
                <li
                  key={status}
                  className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700"
                >
                  {status}: {n}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
