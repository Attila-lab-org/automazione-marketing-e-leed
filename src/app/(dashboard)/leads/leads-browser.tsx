"use client";

import { useRouter } from "next/navigation";
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
  found?: number;
  created?: number;
  duplicates?: number;
  qualified?: number;
  message?: string;
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

export default function LeadsBrowser({
  view = "tutti",
}: {
  view?: "tutti" | "opportunita";
}) {
  const router = useRouter();
  const [creatingDemo, setCreatingDemo] = useState(false);
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

  // Campaign bulk modal
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignLeads, setCampaignLeads] = useState<LeadView[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMode, setCampaignMode] = useState<"MANUAL" | "SCORE_BASED">("MANUAL");
  const [deliveryMode, setDeliveryMode] = useState<"PRODUCTION" | "TEST">("PRODUCTION");
  const [testRecipient, setTestRecipient] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualForm, setManualForm] = useState({
    businessName: "",
    email: "",
    websiteUrl: "",
    phone: "",
    city: "",
  });
  const [creatingCampaign, setCreatingCampaign] = useState(false);

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
      .filter((r) =>
        view === "opportunita"
          ? r.qualificationStatus === "PREQUALIFIED" ||
            r.qualificationStatus === "NEEDS_ANALYSIS"
          : true,
      )
      .sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1));
  }, [rows, minScore, filterCategory, filterCity, filterWebsite, filterStatus, view]);

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
      const raw = await res.text();
      let data: DiscoverResponse = {};
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as DiscoverResponse;
        } catch {
          throw new Error(
            res.ok
              ? "Risposta discovery non valida"
              : `Discovery fallita (HTTP ${res.status})`,
          );
        }
      } else if (!res.ok) {
        throw new Error(`Discovery fallita (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? "Discovery fallita");
      setResultBanner(data.message ?? "Discovery completata");
      setModalOpen(false);
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Discovery fallita");
    } finally {
      setSearching(false);
    }
  }

  async function onCreateDemo(leadId: string) {
    setCreatingDemo(true);
    setResultBanner(null);
    try {
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione demo fallita");
      const id = data.demo?.id as string | undefined;
      if (!id) throw new Error("Demo creata senza id");
      router.push(`/demos/${id}`);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione demo fallita");
      setCreatingDemo(false);
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

  function openCampaignModal(selected: LeadView[]) {
    const dateLabel = new Date().toLocaleDateString("it-IT");
    setCampaignLeads(selected);
    setCampaignName(`Campagna ${dateLabel}`);
    setCampaignMode("MANUAL");
    setDeliveryMode("PRODUCTION");
    setTestRecipient("");
    setCampaignModalOpen(true);
  }

  async function onCreateCampaign(e: FormEvent) {
    e.preventDefault();
    if (!campaignLeads.length || !campaignName.trim()) return;
    if (deliveryMode === "TEST" && !testRecipient.trim()) {
      setResultBanner("Campagna TEST: inserisci l'email destinatario test.");
      return;
    }
    setCreatingCampaign(true);
    setResultBanner(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim(),
          leadIds: campaignLeads.map((l) => l.id),
          mode: campaignMode,
          deliveryMode,
          testRecipient: deliveryMode === "TEST" ? testRecipient.trim() : undefined,
          prepare: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione campagna fallita");
      const campaignId = data.campaignId as string | undefined;
      setResultBanner(
        data.message ??
          `Campagna creata con ${data.leadCount ?? campaignLeads.length} lead — preparazione avviata.`,
      );
      setCampaignModalOpen(false);
      if (campaignId) {
        router.push(`/campaigns/${campaignId}`);
      } else {
        router.push("/review-queue");
      }
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione campagna fallita");
      setCreatingCampaign(false);
    }
  }

  async function onCreateManualLead(e: FormEvent) {
    e.preventDefault();
    setManualBusy(true);
    setResultBanner(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: manualForm.businessName,
          email: manualForm.email,
          websiteUrl: manualForm.websiteUrl || undefined,
          phone: manualForm.phone || undefined,
          city: manualForm.city || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione lead fallita");
      setResultBanner(`Lead manuale creato: ${data.lead?.name ?? manualForm.businessName}`);
      setManualOpen(false);
      setManualForm({ businessName: "", email: "", websiteUrl: "", phone: "", city: "" });
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione lead fallita");
    } finally {
      setManualBusy(false);
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
            onClick={() => setManualOpen(true)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Aggiungi lead manualmente
          </button>
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
          bulkActions={[
            {
              label: "Crea campagna",
              onApply: (rows) => openCampaignModal(rows),
            },
          ]}
        />
      )}

      <LeadQuickDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onCreateDemo={
          selectedLead ? () => void onCreateDemo(selectedLead.id) : undefined
        }
        creatingDemo={creatingDemo}
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

      {campaignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => !creatingCampaign && setCampaignModalOpen(false)}
          />
          <form
            onSubmit={onCreateCampaign}
            className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-stone-900">Crea campagna</h2>
            <p className="mt-1 text-sm text-stone-500">
              {campaignLeads.length} lead selezionat
              {campaignLeads.length === 1 ? "o" : "i"} · preparazione automatica
            </p>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              Nome campagna
              <input
                required
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={creatingCampaign}
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-stone-700">
              Modalità
              <select
                value={campaignMode}
                onChange={(e) =>
                  setCampaignMode(e.target.value as "MANUAL" | "SCORE_BASED")
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={creatingCampaign}
              >
                <option value="MANUAL">MANUAL — review obbligatoria</option>
                <option value="SCORE_BASED">SCORE_BASED — soglie score</option>
              </select>
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-stone-700">Modalità invio</legend>
              <div className="mt-2 flex gap-4 text-sm text-stone-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="deliveryMode"
                    checked={deliveryMode === "PRODUCTION"}
                    onChange={() => setDeliveryMode("PRODUCTION")}
                    disabled={creatingCampaign}
                  />
                  Produzione
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="deliveryMode"
                    checked={deliveryMode === "TEST"}
                    onChange={() => setDeliveryMode("TEST")}
                    disabled={creatingCampaign}
                  />
                  Test
                </label>
              </div>
            </fieldset>

            {deliveryMode === "TEST" ? (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                <p className="text-xs font-semibold text-violet-900">
                  🧪 CAMPAGNA TEST — Nessun prospect reale verrà contattato.
                </p>
                <label className="mt-2 block text-sm font-medium text-stone-700">
                  Email destinatario test
                  <input
                    required
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    disabled={creatingCampaign}
                    placeholder="tua@email.it"
                  />
                </label>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={creatingCampaign}
                onClick={() => setCampaignModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={creatingCampaign}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {creatingCampaign ? "Creazione…" : "Crea campagna"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => !manualBusy && setManualOpen(false)}
          />
          <form
            onSubmit={onCreateManualLead}
            className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-stone-900">Aggiungi lead manualmente</h2>
            <p className="mt-1 text-sm text-stone-500">
              Entra nella stessa pipeline: Lead → Campaign → Demo → Review → Send.
            </p>
            <label className="mt-4 block text-sm font-medium text-stone-700">
              Nome attività
              <input
                required
                value={manualForm.businessName}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, businessName: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={manualBusy}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-stone-700">
              Email
              <input
                required
                type="email"
                value={manualForm.email}
                onChange={(e) => setManualForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={manualBusy}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-stone-700">
              Sito (opzionale)
              <input
                value={manualForm.websiteUrl}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, websiteUrl: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={manualBusy}
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-stone-700">
                Telefono
                <input
                  value={manualForm.phone}
                  onChange={(e) => setManualForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  disabled={manualBusy}
                />
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Città
                <input
                  value={manualForm.city}
                  onChange={(e) => setManualForm((f) => ({ ...f, city: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  disabled={manualBusy}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={manualBusy}
                onClick={() => setManualOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={manualBusy}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {manualBusy ? "Salvataggio…" : "Crea lead"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
