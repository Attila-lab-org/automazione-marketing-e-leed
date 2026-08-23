"use client";

import { useEffect } from "react";
import PolicyBadge, { type PolicyMode } from "./policy-badge";
import ScoreBadge, { type ScoreBreakdownItem } from "./score-badge";
import Timeline, { type TimelineEvent } from "./timeline";

export type LeadQuickDrawerLead = {
  id: string;
  name: string;
  category: string;
  city: string;
  website?: string;
  email?: string;
  phone?: string;
  score?: number;
  confidence?: number;
  scoreBreakdown?: ScoreBreakdownItem[];
  /** Label leggibile dello stato commerciale (§3.1). */
  businessStatusLabel: string;
  /** Label leggibile dello stato di elaborazione (§3.1). */
  processingStatusLabel?: string;
  policyMode?: PolicyMode;
  timeline?: TimelineEvent[];
};

export type LeadQuickDrawerProps = {
  /** null = drawer chiuso. */
  lead: LeadQuickDrawerLead | null;
  onClose: () => void;
  onCreateDemo?: () => void;
  creatingDemo?: boolean;
};

/**
 * LeadQuickDrawer — §21 inventory / §7.1.
 * Preview rapida del lead senza cambiare pagina: contatti, score,
 * policy, stato e mini-timeline. Quick edit in drawer, configurazioni
 * complesse in pagina completa (§21.1).
 */
export default function LeadQuickDrawer({
  lead,
  onClose,
  onCreateDemo,
  creatingDemo = false,
}: LeadQuickDrawerProps) {
  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lead, onClose]);

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Chiudi anteprima lead"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-stone-900/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Anteprima rapida: ${lead.name}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Anteprima rapida lead
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-900">
              {lead.name}
            </h2>
            <p className="text-sm text-stone-500">
              {lead.category} · {lead.city}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-50"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Stati */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Stato
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                title="Stato commerciale del lead (§3.1): NEW → QUALIFIED → CAMPAIGN_READY → CONTACTED → REPLIED → INTERESTED → WON/LOST…"
                className="cursor-help rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700"
              >
                {lead.businessStatusLabel}
              </span>
              {lead.processingStatusLabel ? (
                <span
                  title="Stato della macchina di elaborazione (§3.1): IDLE, ENRICHING, ANALYZING, SCORING, DEMO_GENERATING…"
                  className="cursor-help rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-500"
                >
                  {lead.processingStatusLabel}
                </span>
              ) : null}
              {lead.policyMode ? <PolicyBadge mode={lead.policyMode} /> : null}
            </div>
          </section>

          {/* Score */}
          {typeof lead.score === "number" &&
          typeof lead.confidence === "number" ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Score e confidence
              </h3>
              <ScoreBadge
                score={lead.score}
                confidence={lead.confidence}
                breakdown={lead.scoreBreakdown}
              />
              <p className="mt-1.5 text-xs text-stone-400">
                Passa sopra il badge per il breakdown delle 5 dimensioni
                (§5.1).
              </p>
            </section>
          ) : null}

          {/* Contatti */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Contatti
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-400">Sito web</dt>
                <dd className="truncate font-mono text-xs text-stone-700">
                  {lead.website ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-400">Email</dt>
                <dd className="truncate font-mono text-xs text-stone-700">
                  {lead.email ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-400">Telefono</dt>
                <dd className="font-mono text-xs text-stone-700">
                  {lead.phone ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          {/* Quick actions */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Azioni rapide
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                title="Crea una demo Restaurant Premium dai dati già disponibili. Nessuna email."
                onClick={onCreateDemo}
                disabled={!onCreateDemo || creatingDemo}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
              >
                {creatingDemo ? "Creazione demo…" : "Crea demo"}
              </button>
              <button
                type="button"
                disabled
                title="Messaggi disattivati: Resend resta in mock."
                className="cursor-not-allowed rounded-lg border border-stone-200 px-3 py-2 text-left text-xs font-medium text-stone-300"
              >
                Prepara messaggio
              </button>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Timeline
            </h3>
            <Timeline
              events={lead.timeline ?? []}
              emptyLabel="Nessun evento ancora: la timeline si popola con discovery, scoring e outreach."
            />
          </section>
        </div>
      </aside>
    </div>
  );
}
