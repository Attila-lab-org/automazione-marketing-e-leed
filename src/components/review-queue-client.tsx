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

const BLOCKER_LABELS: Record<string, string> = {
  EMAIL_NOT_FOUND: "Email del cliente non trovata",
  TEST_RECIPIENT_MISSING: "Indirizzo di prova mancante",
  TEST_RECIPIENT_NOT_ALLOWED: "Indirizzo di prova non autorizzato",
  DEMO_NOT_READY: "Anteprima non ancora pronta",
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
          ? "Nessuna attività selezionata è pronta."
          : "Seleziona almeno un’attività senza problemi da risolvere.",
      );
      return;
    }
    const testSelected = approvableSelected.filter((i) => i.deliveryMode === "TEST");
    const ok = window.confirm(
      testSelected.length
        ? `Approvare e avviare la prova per ${ids.length} attività?\nLe email arriveranno soltanto all'indirizzo di prova, non ai clienti.${
            skippedBlockers ? `\n(${skippedBlockers} attività con problemi verranno ignorate)` : ""
          }`
        : `Approvare e avviare l'invio per ${ids.length} attività?${
            skippedBlockers ? `\n(${skippedBlockers} attività con problemi verranno ignorate)` : ""
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
          ? `Approvate ${data.approved ?? ids.length} attività. La prova è in attesa di invio.`
          : `Approvate ${data.approved ?? ids.length} attività. Le email sono in attesa di invio.`,
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
        title="Niente da controllare"
        description="Crea una campagna e avvia la preparazione. Qui compariranno le anteprime e i messaggi prima dell’invio."
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
          title="Approva tutte le attività selezionate che non hanno problemi e avvia gli invii previsti."
          disabled={busy || approvableSelected.length === 0}
          onClick={() => void bulkApprove()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {hasTestItems || approvableSelected.some((i) => i.deliveryMode === "TEST")
            ? `Approva e avvia la prova ${approvableSelected.length || ""}`
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

      {items.map((item) => {
        const isTest = item.deliveryMode === "TEST";
        const deliveryNote = isTest
          ? `Attività: ${item.companyName} · Email del cliente: ${item.email ?? "non disponibile"} · La prova arriverà a: ${item.testRecipient ?? "non disponibile"}`
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
          emailBody={item.body}
          demoSiteId={item.demoSiteId}
          thumbnailLabel={item.previewImageUrl ? "Anteprima email" : undefined}
          selected={selected.has(item.id)}
          onSelectChange={(checked) => toggle(item.id, checked)}
          headerBadge={isTest ? "PROVA" : null}
          deliveryNote={deliveryNote}
          approveLabel={isTest ? "Approva e avvia test" : "Approva"}
          approveDisabled={busy || item.blockers.length > 0}
          approveHint={
            item.blockers.length > 0
              ? `Prima risolvi: ${item.blockers.map(blockerLabel).join(", ")}.`
              : isTest
              ? "Autorizza la prova verso l'indirizzo consentito. Il cliente non riceverà nulla."
              : "Autorizza l'invio di questo messaggio al cliente."
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
              label: item.previewImageUrl ? "Anteprima pronta" : "Anteprima assente",
              ok: Boolean(item.previewImageUrl),
            },
            {
              label: item.blockers.length
                ? `Problemi: ${item.blockers.map(blockerLabel).join(", ")}`
                : "Pronto da controllare",
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
