"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import SectorSelect from "@/components/sector-select";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";
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
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-base font-semibold text-stone-900">1. Cerca i contatti</h2>
        <p className="mt-1 text-sm text-stone-600">
          Stessa ricerca di Contatti: settore e città. I risultati con un sito finiscono nella lista qui sotto.
        </p>
        <form onSubmit={onSearch} className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
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
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 md:self-end"
          >
            {searching ? "Cerco…" : "Avvia ricerca"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-base font-semibold text-stone-900">2. Scegli o inserisci un sito</h2>
        <p className="mt-1 text-sm text-stone-600">
          Prendi un contatto già salvato oppure scrivi l’indirizzo. Apro solo la homepage pubblica, come un visitatore.
        </p>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {checking ? <p className="mt-3 text-sm text-stone-600">Apro la pagina pubblica…</p> : null}
        <form onSubmit={checkPickedContact} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="text-sm font-medium text-stone-700">
            Contatto già in lista
            <select
              value={pickedLeadId}
              onChange={(event) => setPickedLeadId(event.target.value)}
              disabled={busy || contactsWithSite.length === 0}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">
                {contactsWithSite.length === 0
                  ? "Nessun contatto con sito"
                  : "Scegli un’attività…"}
              </option>
              {contactsWithSite.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                  {lead.city ? ` · ${lead.city}` : ""} — {lead.website_url}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !pickedLeadId}
            className="rounded-lg border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-800 disabled:opacity-60 md:self-end"
          >
            {checking ? "Controllo…" : "Controlla questo"}
          </button>
        </form>
        <form onSubmit={checkTypedSite} className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
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
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 md:self-end"
          >
            {checking ? "Apro la pagina…" : "Controlla questo sito"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-base font-semibold text-stone-900">3. Lista e report</h2>
        <p className="mt-1 text-sm text-stone-600">
          Puoi prenderne uno, alcuni, o tutti quelli visibili. Poi parte lo script: apre solo la pagina pubblica e scrive un report con prove, senza ipotesi.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
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
        {banner ? <p className="mt-3 text-sm text-emerald-800">{banner}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {analyzing || checking ? (
          <p className="mt-3 text-sm text-stone-600">
            {checking
              ? "Apro la pagina pubblica…"
              : "Apro le pagine pubbliche, al massimo cinque alla volta…"}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-4 text-sm text-stone-500">Carico la lista…</p>
        ) : (
          <div className="mt-4">
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
          </div>
        )}
      </section>
    </div>
  );
}
