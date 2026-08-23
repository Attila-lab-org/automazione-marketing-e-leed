"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import LeadQuickDrawer, {
  type LeadQuickDrawerLead,
} from "@/components/lead-quick-drawer";
import ScoreBadge from "@/components/score-badge";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";
import type { LeadRow, QualificationStatus } from "@/lib/types/database";
import type { QualificationReason } from "@/lib/domain/discovery-qualification";

type DiscoverResponse = {
  found: number;
  created: number;
  duplicates: number;
  qualified?: number;
  message: string;
  error?: string;
  leads?: LeadRow[];
};

type LeadView = LeadQuickDrawerLead & {
  discoveryScore: number | null;
  discoveryConfidence: number | null;
  qualificationStatus: QualificationStatus;
  offerCandidate: string | null;
  website: string | undefined;
  hasWebsite: boolean;
  reasons: QualificationReason[];
  raw: LeadRow;
};

const STATUS_LABELS: Record<QualificationStatus, string> = {
  NEW: "NEW",
  PREQUALIFIED: "PREQUALIFIED",
  NEEDS_ANALYSIS: "NEEDS ANALYSIS",
  LOW_PRIORITY: "LOW PRIORITY",
  REJECTED: "REJECTED",
};

const STATUS_STYLE: Record<QualificationStatus, string> = {
  NEW: "border-stone-200 bg-stone-50 text-stone-600",
  PREQUALIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  NEEDS_ANALYSIS: "border-amber-200 bg-amber-50 text-amber-800",
  LOW_PRIORITY: "border-stone-200 bg-stone-100 text-stone-500",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

function parseReasons(raw: LeadRow["qualification_reasons"]): QualificationReason[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const r = item as Record<string, unknown>;
    if (typeof r.label !== "string" || typeof r.code !== "string") return [];
    return [
      {
        code: r.code,
        label: r.label,
        scoreDelta: typeof r.scoreDelta === "number" ? r.scoreDelta : 0,
        confidenceDelta:
          typeof r.confidenceDelta === "number" ? r.confidenceDelta : 0,
      } satisfies QualificationReason,
    ];
  });
}

function toView(lead: LeadRow): LeadView {
  const reasons = parseReasons(lead.qualification_reasons);
  return {
    id: lead.id,
    name: lead.name,
    category: lead.category ?? "—",
    city: lead.city ?? "—",
    website: lead.website_url ?? undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    score: lead.discovery_score ?? lead.current_score ?? undefined,
    confidence:
      typeof (lead.discovery_confidence ?? lead.current_confidence) === "number"
        ? (lead.discovery_confidence ?? lead.current_confidence)! / 100
        : undefined,
    businessStatusLabel: STATUS_LABELS[lead.qualification_status] ?? lead.qualification_status,
    processingStatusLabel: lead.offer_candidate
      ? `Offerta: ${lead.offer_candidate}`
      : undefined,
    discoveryScore: lead.discovery_score,
    discoveryConfidence: lead.discovery_confidence,
    qualificationStatus: lead.qualification_status,
    offerCandidate: lead.offer_candidate,
    hasWebsite: Boolean(lead.website_url),
    reasons,
    raw: lead,
    timeline: reasons.slice(0, 8).map((r, i) => ({
      id: `${lead.id}-r${i}`,
      timestampLabel: r.scoreDelta ? `Δ ${r.scoreDelta > 0 ? "+" : ""}${r.scoreDelta}` : "info",
      type: "technical" as const,
      title: r.label,
      description: r.code,
    })),
  };
}

export default function LeadsBrowser() {
  const [rows, setRows] = useState<LeadView[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState("Ristoranti");
  const [location, setLocation] = useState("Milano");
  const [maxResults, setMaxResults] = useState(20);
  const [searching, setSearching] = useState(false);
  const [resultBanner, setResultBanner] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Filters
  const [minScore, setMinScore] = useState(0);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterWebsite, setFilterWebsite] = useState<"all" | "yes" | "no">("all");
  const [filterStatus, setFilterStatus] = useState<"" | QualificationStatus>("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/leads", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Impossibile caricare i lead");
        return (data.leads as LeadRow[] | undefined) ?? [];
      })
      .then((leads) => {
        if (cancelled) return;
        setRows(leads.map(toView));
        setLoadError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setLoadError(err instanceof Error ? err.message : "Errore di caricamento");
        setRows([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  const categories = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.category).filter((c) => c && c !== "—"))).sort(),
    [rows],
  );
  const cities = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.city).filter((c) => c && c !== "—"))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (r.discoveryScore ?? 0) >= minScore)
      .filter((r) => !filterCategory || r.category === filterCategory)
      .filter((r) => !filterCity || r.city === filterCity)
      .filter((r) => {
        if (filterWebsite === "yes") return r.hasWebsite;
        if (filterWebsite === "no") return !r.hasWebsite;
        return true;
      })
      .filter((r) => !filterStatus || r.qualificationStatus === filterStatus)
      .sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1));
  }, [rows, minScore, filterCategory, filterCity, filterWebsite, filterStatus]);

  const columns: SmartDataTableColumn<LeadView>[] = [
    {
      key: "name",
      header: "Azienda",
      render: (lead) => (
        <div>
          <p className="font-medium text-stone-900">{lead.name}</p>
          <p className="text-xs text-stone-400">
            {lead.category} · {lead.city}
          </p>
        </div>
      ),
    },
    {
      key: "score",
      header: "Discovery Score",
      render: (lead) =>
        typeof lead.discoveryScore === "number" ? (
          <ScoreBadge
            score={lead.discoveryScore}
            confidence={(lead.discoveryConfidence ?? 0) / 100}
          />
        ) : (
          <span className="text-xs text-stone-400">—</span>
        ),
    },
    {
      key: "confidence",
      header: "Confidence",
      render: (lead) =>
        typeof lead.discoveryConfidence === "number" ? (
          <span className="font-mono text-sm text-stone-700">
            {lead.discoveryConfidence}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "website",
      header: "Sito",
      render: (lead) =>
        lead.hasWebsite ? (
          <span className="font-mono text-xs text-stone-700 truncate max-w-[140px] block">
            {lead.website}
          </span>
        ) : (
          <span className="text-xs font-medium text-amber-700">Assente</span>
        ),
    },
    {
      key: "status",
      header: "Stato",
      render: (lead) => (
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[lead.qualificationStatus]}`}
        >
          {STATUS_LABELS[lead.qualificationStatus]}
        </span>
      ),
    },
    {
      key: "offer",
      header: "Offerta",
      render: (lead) =>
        lead.offerCandidate ? (
          <span className="text-xs text-stone-600">{lead.offerCandidate}</span>
        ) : (
          <span className="text-xs text-stone-400">—</span>
        ),
    },
  ];

  async function onDiscover(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setResultBanner(null);
    try {
      const res = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          location: location.trim(),
          maxResults,
        }),
      });
      const data = (await res.json()) as DiscoverResponse;
      if (!res.ok) throw new Error(data.error ?? "Discovery fallita");
      setResultBanner(data.message);
      setModalOpen(false);
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Discovery fallita");
    } finally {
      setSearching(false);
    }
  }

  async function onRequalify() {
    setSearching(true);
    try {
      const res = await fetch("/api/leads/qualify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Qualification fallita");
      setResultBanner(data.message);
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Qualification fallita");
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {resultBanner ? (
            <p className="text-sm text-stone-700">{resultBanner}</p>
          ) : (
            <p className="text-sm text-stone-500">
              Discovery Score preliminare · nessun outreach · ordinati per opportunità
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRequalify()}
            disabled={searching}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Riqualifica tutti
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            Trova lead
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-5">
        <label className="text-xs font-medium text-stone-600">
          Score minimo
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Categoria
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tutte</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Città
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tutte</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Sito
          <select
            value={filterWebsite}
            onChange={(e) =>
              setFilterWebsite(e.target.value as "all" | "yes" | "no")
            }
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Tutti</option>
            <option value="yes">Presente</option>
            <option value="no">Assente</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Stato
          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as "" | QualificationStatus)
            }
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tutti</option>
            {(Object.keys(STATUS_LABELS) as QualificationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Caricamento lead…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Nessun lead</p>
          <p className="mt-1 text-sm text-stone-500">
            Usa «Trova lead» (fino a 50) per popolare e qualificare automaticamente.
          </p>
        </div>
      ) : (
        <SmartDataTable
          columns={columns}
          rows={filtered}
          rowKey={(lead) => lead.id}
          searchText={(lead) =>
            `${lead.name} ${lead.category} ${lead.city} ${lead.website ?? ""} ${lead.offerCandidate ?? ""}`
          }
          onRowClick={(lead) => setSelectedLead(lead)}
          bulkActions={[]}
        />
      )}

      <LeadQuickDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      {selectedLead ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">
            Perché {selectedLead.discoveryScore ?? "—"} / confidence{" "}
            {selectedLead.discoveryConfidence ?? "—"}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {selectedLead.reasons.length === 0 ? (
              <li className="text-sm text-stone-500">Nessuna reason (riqualifica il lead).</li>
            ) : (
              selectedLead.reasons.map((r) => (
                <li key={`${selectedLead.id}-${r.code}-${r.label}`} className="text-sm text-stone-700">
                  <span className="font-medium">{r.label}</span>
                  {r.scoreDelta ? (
                    <span className="ml-2 text-xs text-stone-400">
                      score {r.scoreDelta > 0 ? "+" : ""}
                      {r.scoreDelta}
                    </span>
                  ) : null}
                  {r.confidenceDelta ? (
                    <span className="ml-2 text-xs text-stone-400">
                      conf +{r.confidenceDelta}
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => !searching && setModalOpen(false)}
          />
          <form
            onSubmit={onDiscover}
            className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-stone-900">Trova lead</h2>
            <p className="mt-1 text-sm text-stone-500">
              Google Places → dedupe → qualifica automatica (max 50)
            </p>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              Categoria / query
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={searching}
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-stone-700">
              Località
              <input
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={searching}
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-stone-700">
              Numero massimo risultati (1–50)
              <input
                type="number"
                min={1}
                max={50}
                value={maxResults}
                onChange={(e) =>
                  setMaxResults(
                    Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={searching}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={searching}
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={searching}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {searching ? "Ricerca in corso..." : "Cerca"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
