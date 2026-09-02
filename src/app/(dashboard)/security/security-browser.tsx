"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import SectorSelect from "@/components/sector-select";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";
import { normalizeDomain } from "@/lib/leads/normalize";
import type { LeadRow } from "@/lib/types/database";
import {
  SECURITY_STATUS_LABELS,
  securityScoreClass,
  type SecurityTargetListItem,
} from "@/lib/security/labels";

type DiscoverResponse = {
  message?: string;
  error?: string;
  leads?: LeadRow[];
};

const CONTACT_PICKER_LIMIT = 8;

function cityLabel(raw: string | null): string {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (!value) return "";
  return value
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])\p{L}/gu, (match) => match.toLocaleUpperCase("it-IT"));
}

function contactSiteLabel(lead: LeadRow): string {
  const domain = lead.normalized_domain || normalizeDomain(lead.website_url);
  return [lead.name, cityLabel(lead.city), domain].filter(Boolean).join(" · ");
}

function ContactSitePicker({
  contacts,
  value,
  onChange,
  disabled,
  action,
}: {
  contacts: LeadRow[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = contacts.find((lead) => lead.id === value) ?? null;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open, value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((lead) =>
      [lead.name, lead.city ?? "", lead.normalized_domain ?? "", lead.website_url ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [contacts, query]);
  const matches = filtered.slice(0, CONTACT_PICKER_LIMIT);
  const remaining = filtered.length - matches.length;

  return (
    <div ref={rootRef}>
      <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative mt-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="security-contact-picker"
            autoComplete="off"
            disabled={disabled || contacts.length === 0}
            value={open && (query || !selected) ? query : selected ? contactSiteLabel(selected) : ""}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              if (value) onChange("");
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder={contacts.length === 0 ? "Nessun contatto con sito" : "Cerca nome, città o sito…"}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
          />
        </div>
        {action}
      </div>
      {open && contacts.length > 0 ? (
        <ul
          id="security-contact-picker"
          role="listbox"
          className="mt-2 max-h-56 overflow-auto rounded-xl border border-stone-200 bg-white"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-stone-500">Nessun contatto corrisponde.</li>
          ) : (
            matches.map((lead) => (
              <li key={lead.id} className="border-b border-stone-100 last:border-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={lead.id === value}
                  onClick={() => {
                    onChange(lead.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50 ${
                    lead.id === value ? "bg-amber-50" : ""
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-stone-900">{lead.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-stone-500">
                      {[cityLabel(lead.city), lead.normalized_domain || normalizeDomain(lead.website_url)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
          {remaining > 0 ? (
            <li className="px-4 py-2 text-xs text-stone-400">
              Altri {remaining}: continua a scrivere per restringere.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export default function SecurityBrowser() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SecurityTargetListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "listed" | "audited">("all");
  const [contacts, setContacts] = useState<LeadRow[]>([]);
  const [pickedLeadId, setPickedLeadId] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualName, setManualName] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/security/targets", { cache: "no-store" });
    const data = (await response.json()) as { targets?: SecurityTargetListItem[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Lista non disponibile");
    setRows(data.targets ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Lista non disponibile"))
      .finally(() => setLoading(false));
    fetch("/api/leads", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { leads?: LeadRow[] };
        if (response.ok) setContacts(data.leads ?? []);
      })
      .catch(() => {
        /* la scelta dai contatti è facoltativa */
      });
  }, [load]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setBanner(null);
    setError(null);
    try {
      const response = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          location: location.trim(),
          maxResults: 20,
        }),
      });
      const data = (await response.json()) as DiscoverResponse;
      if (!response.ok) throw new Error(data.error ?? "Ricerca non riuscita");
      const leadIds = (data.leads ?? [])
        .filter((lead) => Boolean(lead.website_url))
        .map((lead) => lead.id);
      const withoutSite = (data.leads ?? []).length - leadIds.length;
      if (leadIds.length === 0) {
        setBanner(
          `${data.message ?? "Ricerca completata."} Nessun sito da aprire${withoutSite ? ` (${withoutSite} senza sito)` : ""}.`,
        );
        return;
      }
      const imported = await fetch("/api/security/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const importedData = (await imported.json()) as {
        message?: string;
        error?: string;
        targets?: SecurityTargetListItem[];
      };
      if (!imported.ok) throw new Error(importedData.error ?? "Non ho potuto mettere i siti in lista");
      if (data.leads?.length) {
        setContacts((prev) => {
          const byId = new Map(prev.map((row) => [row.id, row]));
          for (const lead of data.leads ?? []) byId.set(lead.id, lead);
          return [...byId.values()];
        });
      }
      if (importedData.targets) setRows(importedData.targets);
      else await load();
      setBanner(
        `${data.message ?? "Ricerca completata."} ${importedData.message ?? ""} Scegli chi analizzare: uno, alcuni o tutti.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ricerca non riuscita");
    } finally {
      setSearching(false);
    }
  }

  const busy = searching || analyzing || checking;

  const contactsWithSite = useMemo(
    () => contacts.filter((lead) => Boolean(lead.website_url?.trim())),
    [contacts],
  );

  async function checkPickedContact(event: FormEvent) {
    event.preventDefault();
    const lead = contactsWithSite.find((row) => row.id === pickedLeadId);
    if (!lead) {
      setError("Scegli un contatto con sito.");
      return;
    }
    setChecking(true);
    setBanner(null);
    setError(null);
    try {
      const response = await fetch("/api/security/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id] }),
      });
      const data = (await response.json()) as {
        message?: string;
        error?: string;
        results?: Array<{ targetId: string }>;
      };
      if (!response.ok) throw new Error(data.error ?? "Analisi non riuscita");
      const targetId = data.results?.[0]?.targetId;
      await load();
      if (targetId) {
        router.push(`/security/${targetId}`);
        return;
      }
      setBanner(data.message ?? "Report pronto.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analisi non riuscita");
    } finally {
      setChecking(false);
    }
  }

  async function checkTypedSite(event: FormEvent) {
    event.preventDefault();
    if (!manualUrl.trim()) {
      setError("Scrivi l’indirizzo del sito da controllare.");
      return;
    }
    setChecking(true);
    setBanner(null);
    setError(null);
    try {
      const response = await fetch("/api/security/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: manualUrl.trim(),
          name: manualName.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        targetId?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Controllo non riuscito");
      setManualUrl("");
      setManualName("");
      await load();
      if (data.targetId) {
        router.push(`/security/${data.targetId}`);
        return;
      }
      setBanner(data.message ?? "Report pronto.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Controllo non riuscito");
    } finally {
      setChecking(false);
    }
  }

  async function analyzeRows(selected: SecurityTargetListItem[]) {
    const withSite = selected.filter((row) => row.url);
    if (withSite.length === 0) {
      setError("Seleziona almeno un contatto con sito.");
      return;
    }
    setAnalyzing(true);
    setBanner(null);
    setError(null);
    try {
      const response = await fetch("/api/security/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: withSite.map((row) => row.leadId) }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Analisi non riuscita");
      await load();
      setBanner(data.message ?? "Report pronti.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analisi non riuscita");
    } finally {
      setAnalyzing(false);
    }
  }

  const visible = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "listed") {
      return rows.filter((row) => row.status === "listed" || row.status === "failed");
    }
    return rows.filter(
      (row) =>
        row.status === "audited" ||
        row.status === "email_draft" ||
        row.status === "email_sent" ||
        row.status === "deep_open" ||
        row.status === "deep_done",
    );
  }, [rows, statusFilter]);

  const columns: SmartDataTableColumn<SecurityTargetListItem>[] = [
    {
      key: "name",
      header: "Attività",
      render: (row) => (
        <div>
          <div className="font-medium text-stone-900">{row.name}</div>
          <div className="text-xs text-stone-500">{row.domain}</div>
        </div>
      ),
    },
    {
      key: "city",
      header: "Città",
      render: (row) => row.city || "—",
    },
    {
      key: "status",
      header: "Stato",
      render: (row) => SECURITY_STATUS_LABELS[row.status] ?? row.status,
    },
    {
      key: "score",
      header: "Punteggio",
      render: (row) =>
        row.score === null ? (
          <span className="text-stone-400">—</span>
        ) : (
          <span
            className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-semibold tabular-nums ${securityScoreClass(row.score)}`}
          >
            {row.score}
          </span>
        ),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => row.email || "Manca",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Cerca e controlla un sito</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Stessa ricerca di Contatti. Poi scegli un’attività già salvata oppure scrivi l’indirizzo.
          </p>
        </div>

        <form onSubmit={onSearch} className="mt-4 grid items-end gap-3 md:grid-cols-[1.2fr_1fr_auto]">
          <label className="text-sm font-medium text-stone-700">
            Settore
            <SectorSelect value={category} onChange={setCategory} disabled={busy} />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Città o zona
            <input
              required
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Es. Milano"
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !category}
            className="h-10 rounded-lg bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {searching ? "Cerco…" : "Avvia ricerca"}
          </button>
        </form>

        <form onSubmit={checkPickedContact} className="mt-5 border-t border-stone-100 pt-4">
          <p className="text-sm font-medium text-stone-700">Contatto già salvato</p>
          <ContactSitePicker
            contacts={contactsWithSite}
            value={pickedLeadId}
            onChange={setPickedLeadId}
            disabled={busy}
            action={
              <button
                type="submit"
                disabled={busy || !pickedLeadId}
                className="h-10 rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                {checking ? "Controllo…" : "Controlla"}
              </button>
            }
          />
        </form>

        <form
          onSubmit={checkTypedSite}
          className="mt-4 grid items-end gap-3 border-t border-stone-100 pt-4 md:grid-cols-[1fr_1.4fr_auto]"
        >
          <label className="text-sm font-medium text-stone-700">
            Nome attività
            <input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Facoltativo"
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Sito
            <input
              required
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
              placeholder="es. studiomazzei.it"
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !manualUrl.trim()}
            className="h-10 rounded-lg bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {checking ? "Apro la pagina…" : "Controlla questo sito"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {checking ? <p className="mt-3 text-sm text-stone-600">Apro la pagina pubblica…</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Lista e report</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Apri una riga per il report, oppure analizza più siti insieme.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tutti"],
                ["listed", "Da analizzare"],
                ["audited", "Con report"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  statusFilter === id
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {banner ? <p className="text-sm text-emerald-800">{banner}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {analyzing || checking ? (
          <p className="text-sm text-stone-600">
            {checking
              ? "Apro la pagina pubblica…"
              : "Apro le pagine pubbliche, al massimo cinque alla volta…"}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-stone-500">Carico la lista…</p>
        ) : (
          <SmartDataTable
            columns={columns}
            rows={visible}
            rowKey={(row) => row.id}
            searchText={(row) => `${row.name} ${row.domain} ${row.city ?? ""} ${row.email ?? ""}`}
            filterPlaceholder="Filtra per nome, sito, città…"
            onRowClick={(row) => router.push(`/security/${row.id}`)}
            bulkActions={[
              {
                label: analyzing ? "Analizzo…" : "Analizza i selezionati",
                onApply: (selected) => {
                  if (!busy) void analyzeRows(selected);
                },
              },
            ]}
            emptyTitle="Nessun sito in lista"
            emptyDescription="Cerca un settore, scegli un contatto già salvato oppure scrivi l’indirizzo del sito."
          />
        )}
      </section>
    </div>
  );
}
