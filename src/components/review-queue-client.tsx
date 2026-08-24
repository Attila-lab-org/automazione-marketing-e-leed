"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReviewCard from "@/components/review-card";
import EmptyState from "@/components/empty-state";

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

export default function ReviewQueueClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const refresh = useCallback(async () => {
    const r = await fetch("/api/review-queue");
    const data = await r.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

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

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((i) => i.id)));
  }

  async function act(id: string, action: "approve" | "skip" | "stop") {
    await fetch("/api/review-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignLeadId: id, action }),
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await refresh();
  }

  const hasTestItems = useMemo(
    () => items.some((i) => i.deliveryMode === "TEST"),
    [items],
  );

  async function bulkApprove() {
    const ids = approvableSelected.map((i) => i.id);
    const skippedBlockers = selectedItems.length - ids.length;
    if (!ids.length) {
      setMessage(
        skippedBlockers
          ? "Nessun lead selezionato senza blocchi."
          : "Seleziona almeno un lead senza blocchi.",
      );
      return;
    }
    const testSelected = approvableSelected.filter((i) => i.deliveryMode === "TEST");
    const ok = window.confirm(
      testSelected.length
        ? `Approvare e avviare TEST per ${ids.length} lead?\nDestinatario effettivo: casella TEST (non il prospect).${
            skippedBlockers ? `\n(${skippedBlockers} con blocchi verranno ignorati)` : ""
          }`
        : `Approvare e avviare l'invio per ${ids.length} lead?${
            skippedBlockers ? `\n(${skippedBlockers} con blocchi verranno ignorati)` : ""
          }`,
    );
    if (!ok) return;
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
      setMessage(
        testSelected.length
          ? `Approvati ${data.approved ?? ids.length} lead — invio TEST in coda.`
          : `Approvati ${data.approved ?? ids.length} lead — invio in coda.`,
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
    return <p className="text-sm text-stone-500">Caricamento coda review…</p>;
  }

  if (!items.length) {
    return (
      <EmptyState
        title="Nessun lead in review"
        description="Crea una campagna e avvia la preparazione bulk per popolare la coda con demo ed email reali."
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
            checked={selected.size > 0 && selected.size === items.length}
            onChange={(e) => toggleAll(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300"
          />
          Selezionati: {selected.size}
          {approvableSelected.length !== selected.size ? (
            <span className="text-xs text-stone-400">
              ({approvableSelected.length} approvabili)
            </span>
          ) : null}
        </label>
        <button
          type="button"
          disabled={busy || approvableSelected.length === 0}
          onClick={() => void bulkApprove()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {hasTestItems || approvableSelected.some((i) => i.deliveryMode === "TEST")
            ? `Approva e avvia test ${approvableSelected.length || ""}`
            : `Approva e avvia ${approvableSelected.length || ""}`}
        </button>
      </div>

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
              disabled={busy}
              onClick={() => void saveDraft()}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Salva bozza
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {items.map((item) => {
        const isTest = item.deliveryMode === "TEST";
        const deliveryNote = isTest
          ? `Lead: ${item.companyName} · Destinatario commerciale: ${item.email ?? "n/d"} · Destinatario effettivo TEST: ${item.testRecipient ?? "n/d"}`
          : null;
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
          demoSiteId={item.demoSiteId}
          thumbnailLabel={item.previewImageUrl ? "Anteprima email" : undefined}
          selected={selected.has(item.id)}
          onSelectChange={(checked) => toggle(item.id, checked)}
          headerBadge={isTest ? "TEST" : null}
          deliveryNote={deliveryNote}
          approveLabel={isTest ? "Approva e avvia test" : "Approva"}
          approveHint={
            isTest
              ? "Autorizza l'invio TEST verso la casella allowlisted (non il prospect)."
              : "Autorizza l'invio di questo messaggio al lead."
          }
          signals={[
            {
              label: item.email ? "Email trovata" : "Email mancante",
              ok: Boolean(item.email),
              tooltip: item.emailEvidenceLabel
                ? `${item.email ?? ""} · ${item.emailEvidenceLabel}`
                : item.email ?? "Enrichment email non ha trovato un indirizzo pubblico.",
            },
            ...(item.emailEvidenceLabel
              ? [
                  {
                    label: item.emailEvidenceLabel,
                    ok: true as const,
                  },
                ]
              : []),
            {
              label: item.previewImageUrl ? "Preview pronta" : "Preview assente",
              ok: Boolean(item.previewImageUrl),
            },
            {
              label: item.blockers.length
                ? `Blocchi: ${item.blockers.join(", ")}`
                : "Pronto per review",
              ok: item.blockers.length === 0,
            },
          ]}
          onApprove={() => void act(item.id, "approve")}
          onEditDraft={() => startEdit(item)}
          onSkip={() => void act(item.id, "skip")}
          onReject={() => void act(item.id, "stop")}
        />
        );
      })}
    </div>
  );
}
