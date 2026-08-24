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
  NEW: "Nuova",
  PREQUALIFIED: "Buona opportunità",
  NEEDS_ANALYSIS: "Da controllare",
  LOW_PRIORITY: "Bassa priorità",
  REJECTED: "Scartata",
};

const STATUS_STYLE: Record<QualificationStatus, string> = {
  NEW: "border-stone-200 bg-stone-50 text-stone-600",
  PREQUALIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  NEEDS_ANALYSIS: "border-amber-200 bg-amber-50 text-amber-800",
  LOW_PRIORITY: "border-stone-200 bg-stone-100 text-stone-500",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const CATEGORY_GROUPS: Array<{
  label: string;
  values: string[];
}> = [
  {
    label: "Ristoranti",
    values: [
      "restaurant",
      "italian_restaurant",
      "mediterranean_restaurant",
      "seafood_restaurant",
      "family_restaurant",
      "fusion_restaurant",
    ],
  },
  { label: "Pizzerie", values: ["pizza_restaurant"] },
  { label: "Bar ed enoteche", values: ["bar", "wine_bar"] },
  {
    label: "Cibo da asporto",
    values: ["meal_takeaway", "sandwich_shop", "deli"],
  },
  { label: "Agriturismi", values: ["farmstay"] },
];

const DISCOVERY_CATEGORIES = [
  "Ristoranti",
  "Pizzerie",
  "Bar ed enoteche",
  "Agriturismi",
  "Gelaterie",
  "Pasticcerie",
  "Hotel",
  "Parrucchieri",
  "Centri estetici",
  "Palestre",
];

function categoryLabel(raw: string | null): string {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return "Altro settore";
  const group = CATEGORY_GROUPS.find((item) => item.values.includes(value));
  if (group) return group.label;
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cityLabel(raw: string | null): string {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (!value) return "Località non indicata";
  return value
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])\p{L}/gu, (match) => match.toLocaleUpperCase("it-IT"));
}

function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("it-IT");
}

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
    category: categoryLabel(lead.category),
    city: cityLabel(lead.city),
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
    inboxHref:
      lead.category === "inbound_request" ? `/inbox?lead=${lead.id}` : undefined,
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
  const [deliveryMode, setDeliveryMode] = useState<"PRODUCTION" | "TEST">("TEST");
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
      Array.from(
        new Set(rows.map((r) => r.category).filter((c) => c && c !== "Altro settore")),
      ).sort(),
    [rows],
  );
  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.city)
            .filter((c) => c && c !== "Località non indicata"),
        ),
      ).sort(),
    [rows],
  );
  const activeFilterCount =
    Number(minScore > 0) +
    Number(Boolean(filterCategory)) +
    Number(Boolean(filterCity)) +
    Number(filterWebsite !== "all") +
    Number(Boolean(filterStatus));

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (r.discoveryScore ?? 0) >= minScore)
      .filter((r) => !filterCategory || r.category === filterCategory)
      .filter((r) => !filterCity || searchKey(r.city).includes(searchKey(filterCity)))
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
      header: "Attività",
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
      header: "Punteggio",
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
      header: "Affidabilità dati",
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

  function openDiscoverModal() {
    if (filterCategory) setCategory(filterCategory);
    if (filterCity) setLocation(filterCity);
    setModalOpen(true);
  }

  function resetFilters() {
    setMinScore(0);
    setFilterCategory("");
    setFilterCity("");
    setFilterWebsite("all");
    setFilterStatus("");
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
      if (!res.ok) throw new Error(data.error ?? "Ricalcolo fallito");
      setResultBanner(data.message);
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Ricalcolo fallito");
    } finally {
      setSearching(false);
    }
  }

  function openCampaignModal(selected: LeadView[]) {
    const dateLabel = new Date().toLocaleDateString("it-IT");
    setCampaignLeads(selected);
    setCampaignName(`Campagna ${dateLabel}`);
    setCampaignMode("MANUAL");
    setDeliveryMode("TEST");
    setTestRecipient("");
    setCampaignModalOpen(true);
  }

  async function onCreateCampaign(e: FormEvent) {
    e.preventDefault();
    if (!campaignLeads.length || !campaignName.trim()) return;
    if (deliveryMode === "TEST" && !testRecipient.trim()) {
      setResultBanner("Campagna di prova: inserisci l’indirizzo che deve ricevere le email.");
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
          `Campagna creata con ${data.leadCount ?? campaignLeads.length} attività. Preparazione avviata.`,
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
      if (!res.ok) throw new Error(data.error ?? "Creazione attività fallita");
      setResultBanner(`Attività aggiunta: ${data.lead?.name ?? manualForm.businessName}`);
      setManualOpen(false);
      setManualForm({ businessName: "", email: "", websiteUrl: "", phone: "", city: "" });
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione attività fallita");
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
              Le attività sono ordinate dalla più interessante. Da questa pagina non parte nessuna email.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Inserisci a mano un’attività che conosci già."
            onClick={() => setManualOpen(true)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            Aggiungi attività
          </button>
          <button
            type="button"
            title="Ricalcola il punteggio di tutte le attività usando i dati disponibili."
            onClick={() => void onRequalify()}
            disabled={searching}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Riqualifica tutti
          </button>
          <button
            type="button"
            title="Cerca nuove attività su Google per categoria e località."
            onClick={openDiscoverModal}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            Cerca nuove attività
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Filtra le attività salvate</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Questi filtri cambiano soltanto l’elenco qui sotto. La ricerca di nuove attività
              usa invece i dati inseriti nella finestra «Cerca nuove attività».
            </p>
          </div>
          <button
            type="button"
            title="Rimuovi tutti i filtri e mostra l’elenco completo."
            disabled={activeFilterCount === 0}
            onClick={resetFilters}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Azzera filtri{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Punteggio da
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            title="Mostra solo le attività con un punteggio uguale o superiore."
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-3">
          Settore
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            title="Mostra solo le attività già salvate appartenenti a questo settore."
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tutti i settori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-3">
          Città nell’elenco
          <input
            list="lead-city-options"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            placeholder="Tutte le città"
            title="Scrivi o scegli una città tra quelle già presenti nell’elenco."
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
          <datalist id="lead-city-options">
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Sito
          <select
            value={filterWebsite}
            onChange={(e) =>
              setFilterWebsite(e.target.value as "all" | "yes" | "no")
            }
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="all">Con o senza sito</option>
            <option value="yes">Presente</option>
            <option value="no">Assente</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Stato
          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as "" | QualificationStatus)
            }
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Tutti gli stati</option>
            {(Object.keys(STATUS_LABELS) as QualificationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Mostrate <strong className="text-stone-700">{filtered.length}</strong> attività su{" "}
          {rows.length}.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Caricamento attività…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Nessuna attività</p>
          <p className="mt-1 text-sm text-stone-500">
            Usa «Cerca attività» per trovare fino a 50 attività e valutarle automaticamente.
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
            Perché ha punteggio {selectedLead.discoveryScore ?? "—"} e affidabilità{" "}
            {selectedLead.discoveryConfidence ?? "—"}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {selectedLead.reasons.length === 0 ? (
              <li className="text-sm text-stone-500">Nessuna spiegazione disponibile. Ricalcola il punteggio.</li>
            ) : (
              selectedLead.reasons.map((r) => (
                <li key={`${selectedLead.id}-${r.code}-${r.label}`} className="text-sm text-stone-700">
                  <span className="font-medium">{r.label}</span>
                  {r.scoreDelta ? (
                    <span className="ml-2 text-xs text-stone-400">
                      punteggio {r.scoreDelta > 0 ? "+" : ""}
                      {r.scoreDelta}
                    </span>
                  ) : null}
                  {r.confidenceDelta ? (
                    <span className="ml-2 text-xs text-stone-400">
                      affidabilità +{r.confidenceDelta}
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
            <h2 className="text-lg font-semibold text-stone-900">Cerca attività</h2>
            <p className="mt-1 text-sm text-stone-500">
              Questa è una nuova ricerca su Google. Se avevi filtrato settore o città, li abbiamo
              copiati qui come punto di partenza. Puoi cambiarli prima di cercare.
            </p>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              Settore da cercare
              <input
                required
                list="discovery-category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Esempio: Ristoranti"
                title="Scegli un settore oppure scrivine uno diverso."
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={searching}
              />
              <datalist id="discovery-category-options">
                {DISCOVERY_CATEGORIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <label className="mt-4 block text-sm font-medium text-stone-700">
              Città o zona della nuova ricerca
              <input
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Esempio: Milano centro"
                title="Google cercherà nuove attività soltanto in questa città o zona."
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
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Cercherò <strong>{category || "il settore indicato"}</strong> in{" "}
              <strong>{location || "la località indicata"}</strong>.
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                title="Chiudi senza avviare la ricerca."
                disabled={searching}
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                title="Avvia la ricerca con i criteri inseriti."
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
              {campaignLeads.length} attività selezionat
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
                <option value="MANUAL">Controllo manuale — approvi tutto tu</option>
                <option value="SCORE_BASED">Scelta automatica — in base al punteggio</option>
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
                    disabled
                    title="L’invio ai clienti reali non è ancora abilitato."
                  />
                  Clienti reali (non ancora disponibile)
                </label>
                <label
                  title="Le email arriveranno soltanto all’indirizzo di prova inserito."
                  className="flex items-center gap-2"
                >
                  <input
                    type="radio"
                    name="deliveryMode"
                    checked={deliveryMode === "TEST"}
                    onChange={() => setDeliveryMode("TEST")}
                    disabled={creatingCampaign}
                  />
                  Solo prova
                </label>
              </div>
            </fieldset>

            {deliveryMode === "TEST" ? (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                <p className="text-xs font-semibold text-violet-900">
                  INVIO DI PROVA — Nessun cliente reale verrà contattato.
                </p>
                <label className="mt-2 block text-sm font-medium text-stone-700">
                  Indirizzo che riceverà la prova
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
                title="Chiudi senza creare la campagna."
                disabled={creatingCampaign}
                onClick={() => setCampaignModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                title="Crea la campagna con le attività selezionate. Non invia ancora email."
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
            <h2 className="text-lg font-semibold text-stone-900">Aggiungi un’attività</h2>
            <p className="mt-1 text-sm text-stone-500">
              L’attività sarà aggiunta alla lista. Potrai poi creare l’anteprima e inserirla in una campagna.
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
                title="Chiudi senza salvare l’attività."
                disabled={manualBusy}
                onClick={() => setManualOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                title="Salva l’attività nella lista."
                disabled={manualBusy}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {manualBusy ? "Salvataggio…" : "Salva attività"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
