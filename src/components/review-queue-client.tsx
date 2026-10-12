"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReviewCard from "@/components/review-card";
import EmptyState from "@/components/empty-state";
import { pumpCampaignJobs } from "@/lib/campaigns/pump-jobs";

type QueueItem = {
  id: string;
  campaignId: string;
  companyName: string;
  category: string;
  city: string;
  score: number;
  confidence: number;
  subject: string;
  messagePreview: string;
  body: string;
  previewImageUrl: string | null;
  demoUrl: string | null;
  demoSiteId: string | null;
  email: string | null;
  emailEvidenceLabel?: string | null;
  deliveryMode?: "PRODUCTION" | "TEST";
  testRecipient?: string | null;
  blockers: string[];
};

const BLOCKER_LABELS: Record<string, string> = {
  EMAIL_NOT_FOUND: "Email del cliente non trovata",
  TEST_RECIPIENT_MISSING: "Indirizzo di prova mancante",
  TEST_RECIPIENT_NOT_ALLOWED: "Indirizzo di prova non autorizzato",
  DEMO_NOT_READY: "Anteprima non ancora pronta",
  MESSAGE_NOT_READY: "Testo email non ancora scritto",
  PREPARATION_FAILED: "Preparazione non riuscita",
  TEMPLATE_NOT_COMPATIBLE: "Nessun modello compatibile",
};

function blockerLabel(code: string): string {
  return BLOCKER_LABELS[code] ?? "Problema da risolvere";
}

export default function ReviewQueueClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [armed, setArmed] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/review-queue");
    const data = await r.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  const waitingForMessages = items.some((item) => item.blockers.includes("MESSAGE_NOT_READY"));

  useEffect(() => {
    if (!waitingForMessages) return;
    const tick = () => {
      void pumpCampaignJobs(6).finally(() => void refresh());
    };
    tick();
    const timer = window.setInterval(tick, 8000);
    return () => window.clearInterval(timer);
  }, [waitingForMessages, refresh]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review-queue")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

  const approvableSelected = useMemo(
    () => selectedItems.filter((item) => item.blockers.length === 0),
    [selectedItems],
  );

  const sendableItems = useMemo(
    () => items.filter((item) => item.blockers.length === 0),
    [items],
  );

  function toggle(id: string, checked: boolean) {
    setArmed(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setArmed(false);
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(sendableItems.map((i) => i.id)));
  }

  async function act(
    id: string,
    action: "approve" | "skip" | "stop",
  ): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/review-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignLeadId: id, action }),
      });
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};
      if (!res.ok) throw new Error(data.error ?? "Operazione non riuscita");
      if (action === "approve") void pumpCampaignJobs(4);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refresh();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Operazione non riuscita");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    const ids = approvableSelected.map((i) => i.id);
    const skippedBlockers = selectedItems.length - ids.length;
    if (!ids.length) {
      setMessage(
        skippedBlockers
          ? "Nessuna attività selezionata è pronta."
          : "Seleziona almeno un’attività senza problemi da risolvere.",
      );
      return;
    }
    if (!armed) {
      setArmed(true);
      setMessage(
        approvableSelected.some((item) => item.deliveryMode === "TEST")
          ? `Prova: ${ids.length} email arrivano solo all’indirizzo di prova, non ai clienti. Premi di nuovo per confermare.`
          : `Stai per inviare ${ids.length} ${ids.length === 1 ? "email al cliente" : "email ai clienti"}. Premi di nuovo per confermare.`,
      );
      return;
    }
    setArmed(false);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/review-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", campaignLeadIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approvazione fallita");
      const queued = Number(data.queued ?? 0) + Number(data.requeued ?? 0);
      const missing = Number(data.missingDraft ?? 0);
      const waiting = Number(data.waiting ?? 0);
      if (missing > 0) void pumpCampaignJobs(8);
      else if (queued > 0) void pumpCampaignJobs(8);
      setMessage(
        queued > 0
          ? `Ho messo in invio ${queued} ${queued === 1 ? "email" : "email"}.`
          : missing > 0
            ? `Non ho inviato nulla. Manca ancora il testo di ${missing} email: lo sto scrivendo adesso.`
            : waiting > 0
              ? `${waiting} invii erano già in coda.`
              : "Non ho inviato nulla.",
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore approvazione");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: QueueItem) {
    setEditingId(item.id);
    setEditSubject(item.subject);
    setEditBody(item.body || item.messagePreview);
  }

  async function saveDraft() {
    if (!editingId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/review-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateDraft",
          campaignLeadId: editingId,
          subject: editSubject,
          body: editBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Salvataggio bozza fallito");
      setMessage("Bozza aggiornata.");
      setEditingId(null);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Caricamento degli elementi da controllare…</p>;
  }

  if (!items.length) {
    return (
      <EmptyState
        title="Nessuna email da inviare"
        description="Quando il testo è scritto, compare qui. Finché non lo vedi, non c’è niente da mandare."
        nextAction={{ label: "Vai alle campagne", href: "/campaigns" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={sendableItems.length > 0 && selected.size === sendableItems.length}
            disabled={sendableItems.length === 0}
            onChange={(e) => toggleAll(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300"
          />
          {sendableItems.length === 0
            ? "Nessuna email pronta"
            : `Seleziona le ${sendableItems.length} pronte`}
        </label>
        <button
          type="button"
          disabled={busy || approvableSelected.length === 0}
          onClick={() => void bulkApprove()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {approvableSelected.length === 0
            ? "Nessuna email pronta"
            : armed
              ? `Sì, invia ora ${approvableSelected.length}`
              : `Invia ${approvableSelected.length} ${approvableSelected.length === 1 ? "email" : "email"}`}
        </button>
      </div>

      {waitingForMessages ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Sto ancora scrivendo alcune email. Il pulsante Invia si accende solo quando il testo si può leggere.
        </p>
      ) : null}

      {message ? <p className="text-sm text-stone-700">{message}</p> : null}

      {editingId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Modifica bozza</h3>
          <label className="mt-3 block text-xs font-medium text-stone-600">
            Oggetto
            <input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-stone-600">
            Corpo
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              title="Salva le modifiche apportate al messaggio."
              disabled={busy}
              onClick={() => void saveDraft()}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Salva bozza
            </button>
            <button
              type="button"
              title="Chiudi senza salvare le modifiche."
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {[...items]
        .sort((a, b) => a.blockers.length - b.blockers.length)
        .map((item) => {
        const isTest = item.deliveryMode === "TEST";
        const canSend = item.blockers.length === 0;
        const deliveryNote = isTest
          ? `Prova: non arriva al cliente. Arriva a ${item.testRecipient ?? "indirizzo di prova mancante"}.`
          : item.email
            ? `Arriva a ${item.email}`
            : "Non ho l’email del cliente, quindi non parte.";
        return (
        <ReviewCard
          key={item.id}
          companyName={item.companyName}
          category={item.category}
          city={item.city}
          score={item.score}
          confidence={item.confidence}
          subject={item.subject}
          messagePreview={item.messagePreview}
          previewImageUrl={item.previewImageUrl}
          demoUrl={item.demoUrl}
          emailBody={item.body}
          demoSiteId={item.demoSiteId}
          thumbnailLabel="Sito dimostrativo"
          selected={selected.has(item.id)}
          onSelectChange={canSend ? (checked) => toggle(item.id, checked) : undefined}
          headerBadge={isTest ? "PROVA" : null}
          deliveryNote={deliveryNote}
          approveLabel={canSend ? (isTest ? "Invia la prova" : "Invia al cliente") : "Non ancora"}
          approveDisabled={busy || !canSend}
          approveHint={
            canSend
              ? isTest
                ? "Manda la prova solo all’indirizzo di prova."
                : "Manda questa email al cliente."
              : item.blockers.map(blockerLabel).join(", ")
          }
          signals={[
            {
              label: canSend ? "Puoi inviarla" : blockerLabel(item.blockers[0] ?? ""),
              ok: canSend,
            },
          ]}
          onApprove={canSend ? () => void act(item.id, "approve") : undefined}
          onEditDraft={canSend ? () => startEdit(item) : undefined}
          onSkip={() => void act(item.id, "skip")}
        />
        );
      })}
    </div>
  );
}
