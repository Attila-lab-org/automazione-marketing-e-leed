"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import LeadQuickDrawer, {
  type LeadQuickDrawerLead,
} from "@/components/lead-quick-drawer";
import DangerZoneModal from "@/components/danger-zone-modal";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";
import type { LeadRow, QualificationStatus } from "@/lib/types/database";
import type { QualificationReason } from "@/lib/domain/discovery-qualification";
import SectorSelect from "@/components/sector-select";
import {
  DISCOVERY_CATEGORIES,
  MAILABLE_DISCOVERY_CATEGORIES,
  discoveryCategoryLabel,
} from "@/lib/leads/discovery-categories";

type PastSearch = {
  location: string;
  category: string;
  lastAt: string;
  times: number;
  found: number;
};

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

const MAIL_CATEGORIES = new Set<string>(MAILABLE_DISCOVERY_CATEGORIES);

function mailFit(lead: { category: string; email?: string }): { ok: boolean; label: string } {
  if (!lead.email) return { ok: false, label: "Senza email" };
  if (!MAIL_CATEGORIES.has(lead.category)) return { ok: false, label: "Settore non pronto" };
  return { ok: true, label: "Ha l’email" };
}

const STATUS_LABELS: Record<QualificationStatus, string> = {
  NEW: "Nuova",
  PREQUALIFIED: "Buona opportunità",
  NEEDS_ANALYSIS: "Da controllare",
  LOW_PRIORITY: "Bassa priorità",
  REJECTED: "Scartata",
};

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
    category: discoveryCategoryLabel(lead.category),
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
  initialCity = "",
}: {
  view?: "tutti" | "opportunita";
  initialCity?: string;
}) {
  const router = useRouter();
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [rows, setRows] = useState<LeadView[]>([]);
  const [searches, setSearches] = useState<PastSearch[]>([]);
  const [contactedIds, setContactedIds] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<LeadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState(initialCity);
  const [searching, setSearching] = useState(false);
  const [resultBanner, setResultBanner] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [shownIds, setShownIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(view === "opportunita" && !initialCity);

  // Campaign bulk modal
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignLeads, setCampaignLeads] = useState<LeadView[]>([]);
  const [includedCities, setIncludedCities] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualForm, setManualForm] = useState({
    businessName: "",
    category: "",
    email: "",
    websiteUrl: "",
    phone: "",
    city: "",
  });
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [deleteLeads, setDeleteLeads] = useState<LeadView[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [filterCity, setFilterCity] = useState(initialCity);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/leads", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Impossibile caricare i lead");
        return data as {
          leads?: LeadRow[];
          searches?: PastSearch[];
          contactedLeadIds?: string[];
        };
      })
      .then((data) => {
        if (cancelled) return;
        setRows((data.leads ?? []).map(toView));
        setSearches(data.searches ?? []);
        setContactedIds(new Set(data.contactedLeadIds ?? []));
        setLoadError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setLoadError(err instanceof Error ? err.message : "Errore di caricamento");
        setRows([]);
        setSearches([]);
        setContactedIds(new Set());
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  const filtered = useMemo(() => {
    const base = rows.filter((r) =>
      view === "opportunita"
        ? r.qualificationStatus === "PREQUALIFIED" || r.qualificationStatus === "NEEDS_ANALYSIS"
        : true,
    );
    const ranked = [...base].sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1));
    if (shownIds) {
      const ids = new Set(shownIds);
      return ranked.filter((r) => ids.has(r.id));
    }
    if (filterCity.trim()) {
      const key = searchKey(filterCity);
      return ranked.filter((r) => {
        const city = searchKey(r.city);
        return city === key || city.startsWith(`${key} `);
      });
    }
    return showAll ? ranked : [];
  }, [rows, filterCity, shownIds, showAll, view]);

  const columns: SmartDataTableColumn<LeadView>[] = [
    {
      key: "name",
      header: "Attività",
      render: (lead) => (
        <div>
          <p className="font-medium text-stone-900">{lead.name}</p>
          <p className="text-xs text-stone-400">{lead.city}</p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (lead) => {
        if (contactedIds.has(lead.id)) {
          return <span className="text-sm text-stone-500">Già scritta</span>;
        }
        if (!lead.email) return <span className="text-sm text-stone-400">Senza email</span>;
        if (!mailFit(lead).ok) return <span className="text-sm text-stone-500">Settore non pronto</span>;
        return <span className="text-sm text-stone-800">{lead.email}</span>;
      },
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
          maxResults: 60,
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
      const ids = (data.leads ?? []).flatMap((lead) => (lead.id ? [lead.id] : []));
      setShownIds(ids);
      setFilterCity("");
      setShowAll(false);
      setResultBanner(data.message ?? "Ricerca completata");
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

  function inChosenCity(lead: LeadView): boolean {
    if (!filterCity.trim()) return true;
    return searchKey(lead.city).includes(searchKey(filterCity));
  }

  function openCampaignModal(selected: LeadView[]) {
    const scoped = selected.filter(inChosenCity);
    if (!scoped.length) {
      setResultBanner(
        filterCity.trim()
          ? `Nessun contatto selezionato per ${cityLabel(filterCity)}.`
          : "Seleziona almeno un contatto.",
      );
      return;
    }
    const cities = [
      ...new Set(
        scoped
          .filter((lead) => mailFit(lead).ok && !contactedIds.has(lead.id))
          .map((lead) => cityLabel(lead.city)),
      ),
    ].sort((a, b) => a.localeCompare(b, "it"));
    const dateLabel = new Date().toLocaleDateString("it-IT");
    setCampaignLeads(scoped);
    setIncludedCities(cities);
    setCampaignName(
      cities.length === 1 ? `Invio email ${cities[0]} ${dateLabel}` : `Invio email ${dateLabel}`,
    );
    setCampaignModalOpen(true);
  }

  async function onCreateCampaign(e: FormEvent) {
    e.preventDefault();
    if (!campaignLeads.length || !campaignName.trim()) return;
    const chosen = new Set(includedCities);
    const leadIds = campaignLeads
      .filter(
        (lead) =>
          mailFit(lead).ok &&
          !contactedIds.has(lead.id) &&
          chosen.has(cityLabel(lead.city)),
      )
      .map((lead) => lead.id);
    if (!leadIds.length) {
      setResultBanner("Tra i selezionati non c’è nessuno di nuovo a cui scrivere.");
      setCampaignModalOpen(false);
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
          leadIds,
          mode: "MANUAL",
          deliveryMode: "PRODUCTION",
          prepare: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creazione invio email fallita");
      const campaignId = data.campaignId as string | undefined;
      setResultBanner(
        data.message ??
          `Invio creato con ${data.leadCount ?? campaignLeads.length} contatti. Preparazione avviata.`,
      );
      setCampaignModalOpen(false);
      if (campaignId) {
        router.push(`/campaigns/${campaignId}`);
      } else {
        router.push("/review-queue");
      }
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione invio email fallita");
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
          category: manualForm.category || undefined,
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
      setManualForm({ businessName: "", category: "", email: "", websiteUrl: "", phone: "", city: "" });
      setLoading(true);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setResultBanner(err instanceof Error ? err.message : "Creazione attività fallita");
    } finally {
      setManualBusy(false);
    }
  }

  async function onDeleteLeads() {
    if (!deleteLeads.length) return;
    setDeleting(true);
    setResultBanner(null);
    try {
      const response = await fetch("/api/leads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: deleteLeads.map((lead) => lead.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Eliminazione non riuscita");
      setResultBanner(data.message ?? "Contatti eliminati");
      setDeleteLeads([]);
      setSelectedLead(null);
      setLoading(true);
      setReloadToken((value) => value + 1);
    } catch (reason) {
      setResultBanner(reason instanceof Error ? reason.message : "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={onDiscover}
        className="rounded-xl border border-stone-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-stone-900">Cerca una città</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
          <label className="text-sm font-medium text-stone-700">
            Settore
            <SectorSelect value={category} onChange={setCategory} disabled={searching} />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Città o zona
            <input
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Es. Milano"
              disabled={searching}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            {(() => {
              const known = searches.find(
                (item) => searchKey(item.location) === searchKey(location) && item.location.trim(),
              );
              if (!known) return null;
              return (
                <span className="mt-1 block text-xs font-medium text-amber-800">
                  Già cercata. Prendo solo locali nuovi.
                </span>
              );
            })()}
          </label>
          <button
            type="submit"
            disabled={searching || !category}
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 md:self-end"
          >
            {searching ? "Cerco…" : "Cerca"}
          </button>
        </div>
        {resultBanner ? (
          <p
            role="status"
            className={`mt-3 text-sm ${
              /errore|fallit|impossibile/i.test(resultBanner) ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {resultBanner}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-3 text-sm text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
        >
          Aggiungi un contatto a mano
        </button>
      </form>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Caricamento…</p>
      ) : !showAll && !shownIds && !filterCity.trim() ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Cerca una città qui sopra.</p>
          <p className="mt-1 text-sm text-stone-500">I locali compariranno sotto.</p>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setShowAll(true);
                setShownIds(null);
                setFilterCity("");
              }}
              className="mt-4 text-sm text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline"
            >
              Vedi i {rows.length} contatti già salvati
            </button>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Nessun locale in questo elenco</p>
          <button
            type="button"
            onClick={() => {
              setShowAll(true);
              setShownIds(null);
              setFilterCity("");
            }}
            className="mt-4 text-sm text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline"
          >
            Vedi tutti i contatti
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-700">
              {shownIds
                ? "Locali di questa ricerca"
                : filterCity.trim()
                  ? cityLabel(filterCity)
                  : "Tutti i contatti"}
              {" · "}
              {filtered.length}
            </p>
            {shownIds || filterCity.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setShowAll(true);
                  setShownIds(null);
                  setFilterCity("");
                }}
                className="text-sm text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
              >
                Vedi tutti
              </button>
            ) : null}
          </div>
        <SmartDataTable
          columns={columns}
          rows={filtered}
          rowKey={(lead) => lead.id}
          selectionSingular="contatto"
          selectionPlural="contatti"
          filterPlaceholder="Cerca per nome, email o città…"
          searchText={(lead) =>
            `${lead.name} ${lead.category} ${lead.city} ${lead.email ?? ""} ${lead.website ?? ""}`
          }
          onRowClick={(lead) => setSelectedLead(lead)}
          bulkActions={[
            {
              label: "Crea invio con questi",
              variant: "primary",
              onApply: (rows) => openCampaignModal(rows),
            },
            {
              label: "Elimina contatti",
              variant: "danger",
              onApply: (selected) => setDeleteLeads(selected),
            },
          ]}
        />
        </div>
      )}

      <LeadQuickDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onCreateDemo={
          selectedLead ? () => void onCreateDemo(selectedLead.id) : undefined
        }
        creatingDemo={creatingDemo}
      />

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
            <h2 className="text-lg font-semibold text-stone-900">Crea l’invio</h2>
            <p className="mt-1 text-sm text-stone-600">
              L’email non parte adesso. Prima scrivo il testo, poi lo invii tu.
            </p>
            <p className="mt-3 text-sm text-stone-800">
              {campaignLeads.filter((lead) => mailFit(lead).ok && !contactedIds.has(lead.id) && includedCities.includes(cityLabel(lead.city))).length} nuovi possono riceverla.
              {campaignLeads.filter((lead) => contactedIds.has(lead.id)).length
                ? ` ${campaignLeads.filter((lead) => contactedIds.has(lead.id)).length} già scritti restano fuori.`
                : ""}
              {campaignLeads.some((lead) => !mailFit(lead).ok && !contactedIds.has(lead.id))
                ? " Chi non ha l’email non entra."
                : ""}
            </p>
            <div className="mt-4 space-y-2">
              {[...new Set(campaignLeads.map((lead) => cityLabel(lead.city)))]
                .sort((a, b) => a.localeCompare(b, "it"))
                .map((city) => {
                  const inCity = campaignLeads.filter((lead) => cityLabel(lead.city) === city);
                  const fresh = inCity.filter((lead) => mailFit(lead).ok && !contactedIds.has(lead.id)).length;
                  const written = inCity.filter((lead) => contactedIds.has(lead.id)).length;
                  const checked = includedCities.includes(city);
                  return (
                    <label key={city} className="flex items-start gap-2 text-sm text-stone-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-stone-300"
                        checked={checked && fresh > 0}
                        disabled={creatingCampaign || fresh === 0}
                        onChange={(event) => {
                          setIncludedCities((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(city);
                            else next.delete(city);
                            const labels = [...next].sort((a, b) => a.localeCompare(b, "it"));
                            const dateLabel = new Date().toLocaleDateString("it-IT");
                            setCampaignName(
                              labels.length === 1
                                ? `Invio email ${labels[0]} ${dateLabel}`
                                : `Invio email ${dateLabel}`,
                            );
                            return labels;
                          });
                        }}
                      />
                      <span>
                        <span className="font-medium">{city}</span>
                        {fresh > 0 ? ` · ${fresh} nuovi` : " · nessuno di nuovo"}
                        {written > 0 ? ` · ${written} già scritti, esclusi` : ""}
                      </span>
                    </label>
                  );
                })}
            </div>
            {includedCities.length > 1 ? (
              <p className="mt-3 text-sm text-amber-900">
                Hai più città selezionate. L’invio le prepara insieme, ma per mandarle dovrai sceglierne una alla volta.
              </p>
            ) : null}

            <label className="mt-5 block text-sm font-medium text-stone-700">
              Nome invio
              <input
                required
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={creatingCampaign}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                title="Chiudi senza creare l’invio."
                disabled={creatingCampaign}
                onClick={() => setCampaignModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                Annulla
              </button>
              <button
                type="submit"
                title="Crea l’invio con i contatti selezionati. Non invia ancora email."
                disabled={creatingCampaign || includedCities.length === 0}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {creatingCampaign ? "Creazione…" : "Crea invio email"}
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
              L’attività sarà aggiunta ai Contatti e potrà essere inclusa in un invio email.
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
              Settore
              <input
                required
                list="manual-sector-options"
                value={manualForm.category}
                onChange={(event) =>
                  setManualForm((form) => ({ ...form, category: event.target.value }))
                }
                placeholder="Scrivi o scegli il settore"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={manualBusy}
              />
              <datalist id="manual-sector-options">
                {DISCOVERY_CATEGORIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
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

      <DangerZoneModal
        open={deleteLeads.length > 0}
        title="Eliminare i contatti selezionati?"
        description="Eliminerò soltanto i contatti mai usati. Quelli già collegati a campagne o conversazioni saranno conservati per non perdere la cronologia."
        affectedCount={deleteLeads.length}
        affectedLabel="contatti selezionati"
        confirmPhrase="ELIMINA"
        confirmLabel={deleting ? "Eliminazione…" : "Elimina contatti"}
        onConfirm={() => void onDeleteLeads()}
        onCancel={() => !deleting && setDeleteLeads([])}
      />
    </>
  );
}
