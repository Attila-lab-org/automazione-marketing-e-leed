"use client";

import { useMemo, useState, type ReactNode } from "react";

export type SmartDataTableColumn<T> = {
  key: string;
  header: string;
  /** Renderer custom della cella; default: String(row[key]). */
  render?: (row: T) => ReactNode;
  className?: string;
};

export type SmartDataTableBulkAction<T> = {
  label: string;
  /** Riceve le righe selezionate; il conteggio è sempre visibile (§21.1). */
  onApply: (rows: T[]) => void;
  variant?: "default" | "danger";
};

export type SmartDataTableProps<T> = {
  columns: SmartDataTableColumn<T>[];
  rows: T[];
  /** Chiave univoca e stabile della riga. */
  rowKey: (row: T) => string;
  /** Testo indicizzato dal filtro di ricerca rapida. */
  searchText: (row: T) => string;
  filterPlaceholder?: string;
  bulkActions?: SmartDataTableBulkAction<T>[];
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
};

/**
 * SmartDataTable — §21 inventory.
 * Struttura base della data table enterprise: filtro testuale, bulk
 * select con anteprima del numero di record coinvolti (§21.1) e azioni
 * contestuali. I dati arrivano via props; saved views e colonne
 * configurabili arriveranno con il dominio Leads (Phase 2, §7.1).
 */
export default function SmartDataTable<T>({
  columns,
  rows,
  rowKey,
  searchText,
  filterPlaceholder = "Filtra per nome, dominio, email, città…",
  bulkActions = [],
  onRowClick,
  emptyTitle = "Nessun risultato",
  emptyDescription = "Modifica i filtri oppure aggiungi nuovi dati.",
}: SmartDataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchText(row).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selected.has(rowKey(row)));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRows.forEach((row) => next.delete(rowKey(row)));
      } else {
        visibleRows.forEach((row) => next.add(rowKey(row)));
      }
      return next;
    });
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedRows = rows.filter((row) => selected.has(rowKey(row)));

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {/* Barra filtri */}
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
        <div className="relative min-w-64 flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={filterPlaceholder}
            aria-label="Cerca dentro questa tabella"
            title="Scrivi per filtrare subito le righe visibili."
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <span
          title="In futuro potrai salvare una combinazione di filtri e riutilizzarla."
          className="cursor-help rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-400"
        >
          Filtri salvati · presto
        </span>
      </div>

      {/* Barra bulk actions: sempre con conteggio record (§21.1) */}
      {selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-900">
            <span className="tabular-nums">{selectedRows.length}</span>{" "}
            {selectedRows.length === 1
              ? "record selezionato"
              : "record selezionati"}
          </span>
          {bulkActions.map((action) => (
            <button
              key={action.label}
              type="button"
              title={`${action.label} per ${selectedRows.length} righe selezionate.`}
              onClick={() => action.onApply(selectedRows)}
              className={
                action.variant === "danger"
                  ? "rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                  : "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
              }
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            title="Rimuovi la selezione da tutte le righe."
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-medium text-stone-500 underline-offset-2 hover:underline"
          >
            Deseleziona tutto
          </button>
        </div>
      ) : null}

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Seleziona tutte le righe visibili"
                  className="h-4 w-4 accent-stone-700"
                />
              </th>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibleRows.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  title={onRowClick ? "Apri i dettagli di questa riga." : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${selected.has(key) ? "bg-amber-50/60" : "hover:bg-stone-50"}`}
                >
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleRow(key)}
                      aria-label="Seleziona riga"
                      className="h-4 w-4 accent-stone-700"
                    />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-stone-700 ${col.className ?? ""}`}
                    >
                      {col.render
                        ? col.render(row)
                        : String(
                            (row as Record<string, unknown>)[col.key] ?? "—",
                          )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-stone-700">{emptyTitle}</p>
            <p className="mt-1 text-sm text-stone-500">{emptyDescription}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
