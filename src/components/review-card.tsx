"use client";

import Link from "next/link";
import { useState } from "react";
import ScoreBadge from "./score-badge";

export type ReviewCardSignal = {
  label: string;
  ok: boolean;
  tooltip?: string;
};

export type ReviewCardProps = {
  companyName: string;
  category: string;
  city: string;
  score: number;
  confidence: number;
  subject: string;
  messagePreview: string;
  previewImageUrl?: string | null;
  demoUrl?: string | null;
  demoSiteId?: string | null;
  thumbnailLabel?: string;
  signals: ReviewCardSignal[];
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onApprove?: () => void;
  approveLabel?: string;
  approveHint?: string;
  headerBadge?: string | null;
  deliveryNote?: string | null;
  onEditDraft?: () => void;
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

export default function ReviewCard({
  companyName,
  category,
  city,
  score,
  confidence,
  subject,
  messagePreview,
  previewImageUrl,
  demoUrl,
  demoSiteId,
  thumbnailLabel,
  signals,
  selected = false,
  onSelectChange,
  onApprove,
  approveLabel = "Approva",
  approveHint = "Autorizza l'invio di questo messaggio al lead.",
  headerBadge = null,
  deliveryNote = null,
  onEditDraft,
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
      label: approveLabel,
      hint: approveHint,
      callback: onApprove,
      className: "bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent",
    },
    {
      key: "edit",
      label: "Modifica bozza",
      hint: "Modifica subject/body della bozza email.",
      callback: onEditDraft,
      className: "border border-stone-300 text-stone-700 hover:bg-stone-50",
    },
    {
      key: "skip",
      label: "Salta",
      hint: "Rimanda la decisione: la card torna in coda.",
      callback: onSkip,
      className: "border border-stone-300 text-stone-700 hover:bg-stone-50",
    },
    {
      key: "reject",
      label: "Rifiuta",
      hint: "Scarta demo/messaggio per questo lead; nessun invio avverrà.",
      callback: onReject,
      className: "border border-red-300 text-red-700 hover:bg-red-50",
    },
    {
      key: "pause",
      label: "Pausa lead",
      hint: "Sospende ogni automazione su questo lead.",
      callback: onPause,
      className: "border border-amber-300 text-amber-800 hover:bg-amber-50",
    },
  ];

  return (
    <article
      className={`rounded-xl border bg-white transition-opacity ${
        actionTaken && actionTaken !== "edit"
          ? "border-stone-200 opacity-60"
          : selected
            ? "border-amber-300 ring-1 ring-amber-200"
            : "border-stone-200"
      }`}
    >
      <div className="flex gap-4 p-5">
        {onSelectChange ? (
          <label className="flex shrink-0 items-start pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300"
              aria-label={`Seleziona ${companyName}`}
            />
          </label>
        ) : null}

        <div className="hidden h-24 w-36 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100 sm:block">
          {previewImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewImageUrl}
              alt={thumbnailLabel ?? `Anteprima ${companyName}`}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
              <span className="px-2 text-[10px] leading-tight text-stone-400">
                {thumbnailLabel ?? "Anteprima non disponibile"}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">{companyName}</h3>
            {headerBadge ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                {headerBadge}
              </span>
            ) : null}
            <span className="text-xs text-stone-400">
              {category} · {city}
            </span>
            <ScoreBadge score={score} confidence={confidence} />
            {actionTaken ? (
              <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-medium text-stone-50">
                {ACTION_LABEL[actionTaken]}
              </span>
            ) : null}
          </div>

          {deliveryNote ? (
            <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
              {deliveryNote}
            </p>
          ) : null}

          <p className="mt-2 truncate text-sm font-medium text-stone-700">{subject}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{messagePreview}</p>

          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
            {demoUrl ? (
              <a
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-amber-700 hover:underline"
              >
                Apri demo
              </a>
            ) : null}
            {demoSiteId ? (
              <Link href={`/demos/${demoSiteId}`} className="text-stone-600 hover:underline">
                Modifica demo
              </Link>
            ) : null}
          </div>

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
