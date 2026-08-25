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
  sending: number;
  failed: number;
  skipped: number;
  sent: number;
};

type ManualFollowup = {
  campaignLeadId: string;
  leadId: string;
  leadName: string;
  email: string | null;
  sequenceStep: number;
  availableAt: string;
  due: boolean;
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
  GENERATING: "In preparazione",
  READY: "Pronta",
  REVIEW: "Da controllare",
  APPROVED: "Approvata",
  SENDING: "Invio in corso",
  SENT: "Inviata",
  FAILED: "Non riuscita",
  SKIPPED: "Saltata",
  PAUSED: "In pausa",
};

type NextAction =
  | { kind: "prepare"; label: string }
  | { kind: "review"; label: string }
  | { kind: "resume"; label: string }
  | { kind: "wait"; label: string }
  | { kind: "complete"; label: string };

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
  const [manualFollowups, setManualFollowups] = useState<ManualFollowup[]>([]);

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
        setManualFollowups(data.manualFollowups ?? []);
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
    setManualFollowups(data.manualFollowups ?? []);
    setDeliveryMode(data.campaign.delivery_mode === "TEST" ? "TEST" : "PRODUCTION");
    setTestRecipient(data.campaign.test_recipient ?? "");
  }, [campaignId]);

  useEffect(() => {
    if (
      !campaign ||
      !totals ||
      campaign.status === "PAUSED" ||
      campaign.status === "COMPLETED" ||
      (totals.pending === 0 &&
        totals.generating === 0 &&
        totals.approved === 0 &&
        totals.sending === 0)
    ) {
      return;
    }
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [campaign, totals, refresh]);

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

  async function sendManualFollowup(item: ManualFollowup) {
    const ok = window.confirm(
      `Inviare ora il follow-up ${item.sequenceStep} a ${item.leadName}?`,
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_followup",
          campaignLeadId: item.campaignLeadId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invio follow-up fallito");
      setMessage(`Follow-up per ${item.leadName} messo in coda dopo i controlli di sicurezza.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invio follow-up fallito");
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
  const preparing = totals.pending + totals.generating;
  const reviewable = totals.review + totals.ready;
  const problems = totals.failed + totals.skipped;
  const finished = totals.sent + totals.skipped;
  const progress =
    totals.leads > 0 ? Math.min(100, Math.round((finished / totals.leads) * 100)) : 0;

  let nextAction: NextAction;
  let nextTitle: string;
  let nextDescription: string;
  if (campaign.status === "PAUSED") {
    nextAction = { kind: "resume", label: "Riprendi la campagna" };
    nextTitle = "La campagna è in pausa";
    nextDescription =
      "Nessuna nuova operazione parte finché non la riattivi. Le attività già salvate non vengono perse.";
  } else if (reviewable > 0) {
    nextAction = {
      kind: "review",
      label: `Controlla ${reviewable} ${reviewable === 1 ? "attività" : "attività"}`,
    };
    nextTitle = "Le anteprime sono pronte";
    nextDescription =
      "Controlla demo e messaggio. L’approvazione e l’invio avvengono nella schermata di controllo.";
  } else if (preparing > 0) {
    nextAction = { kind: "wait", label: "Preparazione in corso" };
    nextTitle = totals.generating > 0 ? "Sto creando anteprime e messaggi" : "Preparazione in coda";
    nextDescription =
      "Non devi premere nulla: questa pagina si aggiorna automaticamente ogni 5 secondi.";
  } else if (totals.approved > 0 || totals.sending > 0) {
    nextAction = { kind: "wait", label: "Invio in corso" };
    nextTitle = "Le attività approvate sono in lavorazione";
    nextDescription =
      "Send Guard e il provider stanno gestendo gli invii. La pagina si aggiorna automaticamente.";
  } else if (totals.leads > 0 && finished >= totals.leads) {
    nextAction = { kind: "complete", label: "Torna alle campagne" };
    nextTitle = "Campagna completata";
    nextDescription = `${totals.sent} ${
      totals.sent === 1 ? "messaggio inviato" : "messaggi inviati"
    }${totals.skipped ? `, ${totals.skipped} attività saltate` : ""}.`;
  } else {
    nextAction = {
      kind: "prepare",
      label: totals.failed > 0 ? "Riprova la preparazione" : "Avvia la preparazione",
    };
    nextTitle = totals.failed > 0 ? "La preparazione richiede un nuovo tentativo" : "Campagna pronta da preparare";
    nextDescription =
      "Il sistema analizzerà le attività e creerà demo e messaggi. Nessuna email viene inviata in questa fase.";
  }

  const currentStep =
    totals.sent > 0 || totals.approved > 0 || totals.sending > 0
      ? 3
      : reviewable > 0
        ? 2
        : 1;

  function runPrimaryAction() {
    if (nextAction.kind === "prepare") void runAction("prepare");
    if (nextAction.kind === "review") router.push("/review-queue");
    if (nextAction.kind === "resume") void runAction("resume");
    if (nextAction.kind === "complete") router.push("/campaigns");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-stone-900">{campaign.name}</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                  campaign.status === "PAUSED"
                    ? "bg-amber-100 text-amber-800"
                    : campaign.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-100 text-stone-700"
                }`}
              >
                {CAMPAIGN_STATUS[campaign.status] ?? campaign.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {CAMPAIGN_MODE[campaign.mode] ?? campaign.mode} · Creata{" "}
              {new Date(campaign.created_at).toLocaleString("it-IT")}
            </p>
          </div>
          <Link
            href="/campaigns"
            className="text-sm font-medium text-stone-500 hover:text-stone-800"
          >
            ← Tutte le campagne
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2" aria-label="Avanzamento campagna">
          {[
            { n: 1, label: "Prepara" },
            { n: 2, label: "Controlla" },
            { n: 3, label: "Invia" },
          ].map((step) => {
            const active = currentStep === step.n;
            const done = currentStep > step.n || (step.n === 3 && progress === 100);
            return (
              <div
                key={step.n}
                className={`rounded-lg border px-3 py-2 ${
                  active
                    ? "border-amber-300 bg-amber-50"
                    : done
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-stone-200 bg-stone-50"
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-wide ${
                    active ? "text-amber-800" : done ? "text-emerald-700" : "text-stone-400"
                  }`}
                >
                  {done ? "Completato" : active ? "Adesso" : "Dopo"}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-stone-800">
                  {step.n}. {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className={`rounded-xl border p-5 ${
          nextAction.kind === "review"
            ? "border-amber-300 bg-amber-50"
            : nextAction.kind === "complete"
              ? "border-emerald-300 bg-emerald-50"
              : "border-stone-200 bg-white"
        }`}
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Prossimo passo
            </p>
            <h3 className="mt-1 text-lg font-semibold text-stone-900">{nextTitle}</h3>
            <p className="mt-1 text-sm leading-6 text-stone-600">{nextDescription}</p>
          </div>
          <button
            type="button"
            disabled={busy || nextAction.kind === "wait"}
            onClick={runPrimaryAction}
            className={`shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70 ${
              nextAction.kind === "complete"
                ? "bg-emerald-700 hover:bg-emerald-800"
                : "bg-stone-900 hover:bg-stone-800"
            }`}
          >
            {busy ? "Operazione in corso…" : nextAction.label}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Attività", value: totals.leads, note: "nella campagna" },
          { label: "In preparazione", value: preparing, note: "automaticamente" },
          { label: "Da controllare", value: reviewable, note: "richiedono la tua verifica" },
          { label: "Inviati", value: totals.sent, note: `${progress}% completato` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-500">{stat.note}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-900">Follow-up manuali</h3>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Nessun sollecito parte da solo. Quando è trascorso il tempo previsto, scegli tu
              cliente per cliente. Chi ha risposto viene rimosso automaticamente da questa lista.
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
            {manualFollowups.filter((item) => item.due).length} disponibili ora
          </span>
        </div>

        {manualFollowups.length ? (
          <ul className="mt-4 divide-y divide-stone-100">
            {manualFollowups.map((item) => (
              <li
                key={item.campaignLeadId}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-stone-900">{item.leadName}</p>
                  <p className="text-xs text-stone-500">
                    {item.email ?? "Email non disponibile"} · Follow-up {item.sequenceStep} ·{" "}
                    {item.due
                      ? "disponibile adesso"
                      : `disponibile dal ${new Date(item.availableAt).toLocaleString("it-IT")}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || !item.due}
                  onClick={() => void sendManualFollowup(item)}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
                >
                  {item.due ? "Invia follow-up" : "Non ancora disponibile"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Nessun follow-up da valutare. Compariranno qui solo i clienti che non hanno risposto.
          </div>
        )}
      </section>

      {problems > 0 ? (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            {problems} {problems === 1 ? "attività richiede" : "attività richiedono"} attenzione
          </p>
          <p className="mt-1 text-xs text-red-700">
            {totals.failed ? `${totals.failed} non riuscite. ` : ""}
            {totals.skipped ? `${totals.skipped} saltate perché non idonee.` : ""}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white">
        <details>
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-stone-800">
            Impostazioni e controlli secondari
            <span className="ml-2 text-xs font-normal text-stone-400">
              {isTest ? "Invio sicuro di prova" : "Produzione"}
            </span>
          </summary>
          <div className="border-t border-stone-100 px-5 py-4">
            <div className="rounded-lg bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-800">Destinazione invio</p>
              <p className="mt-1 text-xs text-stone-500">
                {isTest
                  ? `Le email vanno solo a ${campaign.test_recipient ?? "un indirizzo autorizzato"}; i clienti non vengono contattati.`
                  : "Le email vanno ai clienti idonei dopo approvazione e Send Guard."}
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="radio"
                    name="delivery"
                    checked={deliveryMode === "PRODUCTION"}
                    onChange={() => setDeliveryMode("PRODUCTION")}
                    disabled
                  />
                  Clienti reali
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="radio"
                    name="delivery"
                    checked={deliveryMode === "TEST"}
                    onChange={() => setDeliveryMode("TEST")}
                    disabled={busy}
                  />
                  Indirizzo sicuro di prova
                </label>
              </div>
              {deliveryMode === "TEST" ? (
                <label className="mt-3 block max-w-md text-sm text-stone-700">
                  Indirizzo autorizzato
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    placeholder="nome@dominio.it"
                    disabled={busy}
                  />
                </label>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDelivery()}
                className="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                Salva destinazione
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Aggiorna ora
              </button>
              {campaign.status !== "PAUSED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction("pause")}
                  className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  Metti in pausa
                </button>
              ) : null}
            </div>

            {Object.keys(counts).length > 0 ? (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Dettaglio tecnico
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
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
        </details>
      </section>
    </div>
  );
}
