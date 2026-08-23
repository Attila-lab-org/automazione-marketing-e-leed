"use client";

import { useState } from "react";
import ScoreBadge from "./score-badge";

export type ReviewCardSignal = {
  /** Es. "Email valida", "Audit completato", "Template match". */
  label: string;
  ok: boolean;
  /** Tooltip esplicativo del segnale (§21.1). */
  tooltip?: string;
};

export type ReviewCardProps = {
  companyName: string;
  category: string;
  city: string;
  score: number;
  confidence: number;
  /** Oggetto dell'email proposta. */
  subject: string;
  /** Anteprima del messaggio (prime righe). */
  messagePreview: string;
  /** Etichetta della thumbnail demo, es. "Template Ristoranti v3". */
  thumbnailLabel?: string;
  signals: ReviewCardSignal[];
  /** Callback opzionali; in assenza la card registra l'azione localmente (demo). */
  onApprove?: () => void;
  onEdit?: () => void;
  onSkip?: () => void;
  onReject?: () => void;
  onPause?: () => void;
};

type ReviewAction = "approve" | "edit" | "skip" | "reject" | "pause";

const ACTION_LABEL: Record<ReviewAction, string> = {
  approve: "Approvato",
  edit: "In modifica",
  skip: "Saltato",
  reject: "Rifiutato",
  pause: "In pausa",
};

/**
 * ReviewCard — §21 inventory / §8.2.
 * Card della Review Queue: azienda, score/confidence, thumbnail demo,
 * oggetto e preview messaggio, segnali chiave e azioni rapide
 * Approve / Edit / Skip / Reject / Pause Lead.
 */
export default function ReviewCard({
  companyName,
  category,
  city,
  score,
  confidence,
  subject,
  messagePreview,
  thumbnailLabel,
  signals,
  onApprove,
  onEdit,
  onSkip,
  onReject,
  onPause,
}: ReviewCardProps) {
  const [actionTaken, setActionTaken] = useState<ReviewAction | null>(null);

  function act(action: ReviewAction, callback?: () => void) {
    setActionTaken(action);
    callback?.();
  }

  const actions: {
    key: ReviewAction;
    label: string;
    hint: string;
    callback?: () => void;
    className: string;
  }[] = [
    {
      key: "approve",
      label: "Approva",
      hint: "Autorizza l'invio di questo messaggio al lead (§8.2).",
      callback: onApprove,
      className:
        "bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent",
    },
    {
      key: "edit",
      label: "Modifica",
      hint: "Apre l'editor: l'override non modifica il master template (§11).",
      callback: onEdit,
      className:
        "border border-stone-300 text-stone-700 hover:bg-stone-50",
    },
    {
      key: "skip",
      label: "Salta",
      hint: "Rimanda la decisione: la card torna in coda.",
      callback: onSkip,
      className:
        "border border-stone-300 text-stone-700 hover:bg-stone-50",
    },
    {
      key: "reject",
      label: "Rifiuta",
      hint: "Scarta demo/messaggio per questo lead; nessun invio avverrà.",
      callback: onReject,
      className:
        "border border-red-300 text-red-700 hover:bg-red-50",
    },
    {
      key: "pause",
      label: "Pausa lead",
      hint: "Sospende ogni automazione su questo lead (§19.2).",
      callback: onPause,
      className:
        "border border-amber-300 text-amber-800 hover:bg-amber-50",
    },
  ];

  return (
    <article
      className={`rounded-xl border bg-white transition-opacity ${
        actionTaken && actionTaken !== "edit"
          ? "border-stone-200 opacity-60"
          : "border-stone-200"
      }`}
    >
      <div className="flex gap-4 p-5">
        {/* Thumbnail demo */}
        <div
          title={
            thumbnailLabel ??
            "Thumbnail demo: screenshot della landing generata (§10.1)."
          }
          className="hidden h-24 w-36 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-stone-200 bg-stone-100 text-center sm:flex"
        >
          <span aria-hidden className="text-stone-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-6 w-6"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path strokeLinecap="round" d="M3 9h18M8 21h8" />
            </svg>
          </span>
          <span className="px-2 text-[10px] leading-tight text-stone-400">
            {thumbnailLabel ?? "Anteprima demo"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">
              {companyName}
            </h3>
            <span className="text-xs text-stone-400">
              {category} · {city}
            </span>
            <ScoreBadge score={score} confidence={confidence} />
            {actionTaken ? (
              <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-medium text-stone-50">
                {ACTION_LABEL[actionTaken]} (demo)
              </span>
            ) : null}
          </div>

          <p className="mt-2 truncate text-sm font-medium text-stone-700">
            {subject}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">
            {messagePreview}
          </p>

          {/* Segnali chiave */}
          <div className="mt-3 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span
                key={signal.label}
                title={signal.tooltip ?? signal.label}
                className={`inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  signal.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-stone-50 text-stone-500"
                }`}
              >
                <span aria-hidden>{signal.ok ? "✓" : "○"}</span>
                {signal.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            title={action.hint}
            onClick={() => act(action.key, action.callback)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${action.className}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}
