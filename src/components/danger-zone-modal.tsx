"use client";

import { useEffect, useState } from "react";

export type DangerZoneModalProps = {
  open: boolean;
  /** Titolo dell'operazione pericolosa, es. "Pausa tutto l'outreach". */
  title: string;
  /** Spiega l'effetto reale dell'operazione (§19.2). */
  description: string;
  /** Numero di record/job coinvolti — sempre mostrato (§21: conferma con conteggio). */
  affectedCount?: number;
  /** Etichetta del conteggio, es. "invii programmati". */
  affectedLabel?: string;
  /** Frase da digitare per abilitare la conferma. Default "CONFERMA". */
  confirmPhrase?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * DangerZoneModal — §21 inventory.
 * Conferma esplicita per operazioni pericolose (full auto, bulk send,
 * delete, kill switch): richiede di digitare una frase di conferma e
 * mostra il conteggio dei record coinvolti (§21.1 bulk actions).
 */
export default function DangerZoneModal({
  open,
  title,
  description,
  affectedCount,
  affectedLabel = "record coinvolti",
  confirmPhrase = "CONFERMA",
  confirmLabel,
  cancelLabel = "Annulla",
  onConfirm,
  onCancel,
}: DangerZoneModalProps) {
  const [typed, setTyped] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset della frase digitata a ogni apertura (adjust-during-render,
  // evita setState in effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTyped("");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = typed.trim().toUpperCase() === confirmPhrase.toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="danger-zone-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        aria-label={cancelLabel}
        title={cancelLabel}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-stone-900/50"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              />
            </svg>
          </span>
          <div>
            <h2
              id="danger-zone-title"
              className="text-base font-semibold text-stone-900"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{description}</p>
          </div>
        </div>

        {typeof affectedCount === "number" ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold tabular-nums">{affectedCount}</span>{" "}
            {affectedLabel} saranno interessati da questa operazione.
          </div>
        ) : null}

        <label className="mt-4 block text-sm text-stone-600">
          Digita{" "}
          <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-stone-800">
            {confirmPhrase}
          </span>{" "}
          per confermare
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            placeholder={confirmPhrase}
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            title="Chiudi senza eseguire l’operazione."
            onClick={onCancel}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            title={canConfirm ? "Esegui l’operazione confermata." : `Scrivi ${confirmPhrase} per abilitare questo pulsante.`}
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
