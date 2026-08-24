"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CampaignDetail = {
  id: string;
  name: string;
  status: string;
  mode: string;
  delivery_mode?: "PRODUCTION" | "TEST";
  test_recipient?: string | null;
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

const ACTIVITY_STATUS: Record<string, string> = {
  PENDING: "In attesa",
  RESEARCHING: "Ricerca in corso",
  READY_FOR_REVIEW: "Da controllare",
  APPROVED: "Approvata",
  SENDING: "Invio in corso",
  SENT: "Inviata",
  FAILED: "Non riuscita",
  SKIPPED: "Saltata",
  PAUSED: "In pausa",
};

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"PRODUCTION" | "TEST">("PRODUCTION");
  const [testRecipient, setTestRecipient] = useState("");

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
        setDeliveryMode(data.campaign.delivery_mode === "TEST" ? "TEST" : "PRODUCTION");
        setTestRecipient(data.campaign.test_recipient ?? "");
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
    setDeliveryMode(data.campaign.delivery_mode === "TEST" ? "TEST" : "PRODUCTION");
    setTestRecipient(data.campaign.test_recipient ?? "");
  }, [campaignId]);

  async function runAction(action: "prepare" | "approve" | "pause" | "resume") {
    if (action === "approve") {
      const n = (totals?.review ?? 0) + (totals?.ready ?? 0);
      const isTest = campaign?.delivery_mode === "TEST";
      const ok = window.confirm(
        isTest
          ? `Approvare e avviare la prova per le attività pronte${n ? ` (${n})` : ""}?\nNessun cliente reale verrà contattato. Le email arriveranno solo a ${campaign?.test_recipient ?? "indirizzo di prova"}.`
          : `Approvare e avviare l'invio per le attività pronte di questa campagna${
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
            ? `Preparazione avviata: ${data.enqueued} operazioni in attesa. I conteggi si aggiornano quando le operazioni vengono eseguite.`
            : "Preparazione avviata.",
        );
      } else if (action === "approve") {
        setMessage(
          campaign?.delivery_mode === "TEST"
            ? `Approvate ${data.approved ?? 0} attività. La prova è in attesa di invio.`
            : `Approvate ${data.approved ?? 0} attività. Le email sono in attesa di invio.`,
        );
      } else if (action === "pause") {
        setMessage("Campagna in pausa. I messaggi successivi restano in attesa.");
      } else {
        const released =
          typeof data.releasedJobs === "number" ? data.releasedJobs : 0;
        setMessage(
          released > 0
            ? `Campagna ripresa: ${released} operazioni in attesa sono state riattivate.`
            : "Campagna ripresa.",
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function saveDelivery() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_delivery",
          deliveryMode,
          testRecipient: deliveryMode === "TEST" ? testRecipient : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Salvataggio fallito");
      setMessage(
        deliveryMode === "TEST"
          ? "Modalità di prova salvata. Nessun cliente reale verrà contattato."
          : "Modalità Produzione salvata.",
      );
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

  const isTest = campaign.delivery_mode === "TEST";

  const statCards: { label: string; value: number }[] = [
    { label: "Totale attività", value: totals.leads },
    { label: "In attesa", value: totals.pending },
    { label: "In generazione", value: totals.generating },
    { label: "Da controllare", value: totals.review },
    { label: "Pronti", value: totals.ready },
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
              {CAMPAIGN_MODE[campaign.mode] ?? campaign.mode} ·{" "}
              {CAMPAIGN_STATUS[campaign.status] ?? campaign.status}
              {isTest ? " · PROVA" : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-stone-900">{campaign.name}</h2>
              {isTest ? (
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-violet-800">
                  PROVA
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-stone-500">
              Creata {new Date(campaign.created_at).toLocaleString("it-IT")}
            </p>
          </div>
          <Link href="/campaigns" className="text-sm text-stone-500 hover:text-stone-800">
            ← Tutte le campagne
          </Link>
        </div>

        {isTest ? (
          <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <p className="font-semibold">CAMPAGNA DI PROVA</p>
            <p className="mt-1">
              Nessun cliente reale verrà contattato. Le email arriveranno a:{" "}
              <strong>{campaign.test_recipient ?? "—"}</strong>
            </p>
            <p className="mt-1 text-xs text-violet-700">
              I due messaggi successivi partono dopo 5 e 10 minuti. Puoi mettere in pausa in qualsiasi momento.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Questa campagna è impostata per clienti reali, ma gli invii reali non sono ancora
            abilitati. Passa a «Solo prova» prima di avviarla.
          </div>
        )}

        <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-800">Modalità invio</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="radio"
                name="delivery"
                checked={deliveryMode === "PRODUCTION"}
                onChange={() => setDeliveryMode("PRODUCTION")}
                disabled
                title="L’invio ai clienti reali non è ancora abilitato."
              />
              Clienti reali (non ancora disponibile)
            </label>
            <label
              title="Le email arriveranno soltanto all’indirizzo di prova inserito."
              className="flex items-center gap-2 text-sm text-stone-700"
            >
              <input
                type="radio"
                name="delivery"
                checked={deliveryMode === "TEST"}
                onChange={() => setDeliveryMode("TEST")}
                disabled={busy}
              />
              Solo prova
            </label>
          </div>
          {deliveryMode === "TEST" ? (
            <label className="mt-3 block text-sm text-stone-700">
              Indirizzo che riceverà la prova
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-stone-300 px-3 py-2 text-sm"
                placeholder="tua@email.it"
                disabled={busy}
              />
            </label>
          ) : null}
          <button
            type="button"
            title="Salva se questa campagna deve contattare clienti reali oppure soltanto l’indirizzo di prova."
            disabled={busy}
            onClick={() => void saveDelivery()}
            className="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Salva modalità invio
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            title="Ricarica i conteggi per vedere se la preparazione è avanzata."
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Aggiorna stato
          </button>
          <button
            type="button"
            title="Crea anteprime e messaggi per le attività della campagna. Non invia email."
            disabled={busy}
            onClick={() => void runAction("prepare")}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            Prepara anteprime e messaggi
          </button>
          <button
            type="button"
            title="Apri la pagina dove controllare anteprime e messaggi prima dell’invio."
            disabled={busy}
            onClick={() => router.push("/review-queue")}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Controlla prima dell’invio
          </button>
          <button
            type="button"
            title={isTest ? "Approva e invia soltanto all’indirizzo di prova." : "Passa a «Solo prova»: gli invii ai clienti reali non sono ancora abilitati."}
            disabled={busy || !isTest}
            onClick={() => void runAction("approve")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isTest ? "Approva e avvia la prova" : "Approva e avvia"}
          </button>
          {campaign.status === "PAUSED" ? (
            <button
              type="button"
              title="Riattiva la preparazione e gli invii di questa campagna."
              disabled={busy}
              onClick={() => void runAction("resume")}
              className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              Riprendi
            </button>
          ) : (
            <button
              type="button"
              title="Blocca temporaneamente preparazione e invii di questa campagna."
              disabled={busy}
              onClick={() => void runAction("pause")}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            >
              Pausa
            </button>
          )}
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => (
          <div
            key={s.label}
            title={`Numero di elementi nello stato “${s.label}”.`}
            tabIndex={0}
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
                  {ACTIVITY_STATUS[status] ?? status}: {n}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
