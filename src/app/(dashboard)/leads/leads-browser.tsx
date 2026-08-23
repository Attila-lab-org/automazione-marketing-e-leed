"use client";

import { useEffect, useState, type FormEvent } from "react";
import LeadQuickDrawer, {
  type LeadQuickDrawerLead,
} from "@/components/lead-quick-drawer";
import ScoreBadge from "@/components/score-badge";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";
import type { LeadRow } from "@/lib/types/database";

type DiscoverResponse = {
  found: number;
  created: number;
  duplicates: number;
  message: string;
  error?: string;
  leads?: LeadRow[];
};

const BUSINESS_LABELS: Record<string, string> = {
  NEW: "Nuovo",
  QUALIFIED: "Qualificato",
  CAMPAIGN_READY: "Pronto campagna",
  CONTACTED: "Contattato",
  REPLIED: "Ha risposto",
  INTERESTED: "Interessato",
  WON: "Vinto",
  LOST: "Perso",
  NOT_INTERESTED: "Non interessato",
  SUPPRESSED: "Soppresso",
};

const PROCESSING_LABELS: Record<string, string> = {
  IDLE: "In attesa (Idle)",
  ENRICHING: "Enrichment",
  ANALYZING: "Analisi sito",
  SCORING: "Scoring",
  DEMO_GENERATING: "Demo",
  SCREENSHOT_GENERATING: "Screenshot",
  MESSAGE_GENERATING: "Messaggio",
  SENDING: "Invio",
  FAILED: "Errore",
};

function leadRowToDrawer(lead: LeadRow): LeadQuickDrawerLead {
  return {
    id: lead.id,
    name: lead.name,
    category: lead.category ?? "—",
    city: lead.city ?? "—",
    website: lead.website_url ?? undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    score: lead.current_score ?? undefined,
    confidence:
      typeof lead.current_confidence === "number"
        ? lead.current_confidence / 100
        : undefined,
    businessStatusLabel: BUSINESS_LABELS[lead.business_status] ?? lead.business_status,
    processingStatusLabel:
      PROCESSING_LABELS[lead.processing_status] ?? lead.processing_status,
    timeline: [
      {
        id: `${lead.id}-src`,
        timestampLabel: new Date(lead.created_at).toLocaleString("it-IT", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: "technical",
        title: "Lead da Google Places",
        description: lead.google_place_id
          ? `Place ID: ${lead.google_place_id}`
          : "Senza Place ID",
      },
    ],
  };
}

const COLUMNS: SmartDataTableColumn<LeadQuickDrawerLead>[] = [
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
    header: "Score",
    render: (lead) =>
      typeof lead.score === "number" ? (
        <ScoreBadge
          score={lead.score}
          confidence={lead.confidence ?? 0}
          breakdown={lead.scoreBreakdown}
        />
      ) : (
        <span className="text-xs text-stone-400">—</span>
      ),
  },
  {
    key: "website",
    header: "Sito",
    render: (lead) =>
      lead.website ? (
        <span className="font-mono text-xs text-stone-700">{lead.website}</span>
      ) : (
        <span className="text-xs text-stone-400">—</span>
      ),
  },
  {
    key: "email",
    header: "Email",
    render: (lead) =>
      lead.email ? (
        <span className="font-mono text-xs">{lead.email}</span>
      ) : (
        <span className="text-xs text-stone-400">Non inventata</span>
      ),
  },
  {
    key: "businessStatusLabel",
    header: "Stato",
    render: (lead) => (
      <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-600">
        {lead.businessStatusLabel}
      </span>
    ),
  },
];

export default function LeadsBrowser() {
  const [rows, setRows] = useState<LeadQuickDrawerLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadQuickDrawerLead | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState("Ristoranti");
  const [location, setLocation] = useState("Milano");
  const [maxResults, setMaxResults] = useState(5);
  const [searching, setSearching] = useState(false);
  const [resultBanner, setResultBanner] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/leads", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Impossibile caricare i lead");
        }
        return (data.leads as LeadRow[] | undefined) ?? [];
      })
      .then((leads) => {
        if (cancelled) return;
        setRows(leads.map(leadRowToDrawer));
        setLoadError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setLoadError(
          err instanceof Error ? err.message : "Errore di caricamento",
        );
        setRows([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

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
      if (!res.ok) {
        throw new Error(data.error ?? "Discovery fallita");
      }
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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {resultBanner ? (
            <p className="text-sm text-stone-700">{resultBanner}</p>
          ) : (
            <p className="text-sm text-stone-500">
              Dati reali da Supabase · nessuna fixture dimostrativa in produzione
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          Trova lead
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Caricamento lead…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Nessun lead ancora</p>
          <p className="mt-1 text-sm text-stone-500">
            Usa «Trova lead» per cercare su Google Places (max 5) e salvare in
            Supabase.
          </p>
        </div>
      ) : (
        <SmartDataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(lead) => lead.id}
          searchText={(lead) =>
            `${lead.name} ${lead.category} ${lead.city} ${lead.website ?? ""} ${lead.email ?? ""} ${lead.phone ?? ""}`
          }
          onRowClick={(lead) => setSelectedLead(lead)}
          bulkActions={[]}
        />
      )}

      <LeadQuickDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />

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
              Text Search Google Places (New) · massimo 5 risultati
            </p>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              Categoria / query
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                placeholder="Ristoranti"
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
                placeholder="Milano"
                disabled={searching}
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-stone-700">
              Numero massimo risultati
              <input
                type="number"
                min={1}
                max={5}
                value={maxResults}
                onChange={(e) =>
                  setMaxResults(
                    Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                disabled={searching}
              />
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
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
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
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
