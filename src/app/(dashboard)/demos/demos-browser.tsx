"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DemoRow = {
  id: string;
  slug: string;
  publicPath: string;
  status: string;
  leadName: string;
  leadCity: string | null;
  templateName: string;
  templateVersion: number;
  updatedAt: string;
};

export default function DemosBrowser() {
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demos")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Elenco demo fallito");
        if (!cancelled) setRows(data.demos ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-stone-500">Caricamento demo…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-stone-800">Nessuna demo ancora</p>
        <p className="mt-1 text-sm text-stone-500">
          Apri un lead e usa «Crea demo». Non vengono generate automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-100 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Lead</th>
            <th className="px-4 py-3 font-medium">Template</th>
            <th className="px-4 py-3 font-medium">Stato</th>
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-stone-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-stone-900">{row.leadName}</p>
                <p className="text-xs text-stone-400">{row.leadCity ?? "—"}</p>
              </td>
              <td className="px-4 py-3 text-stone-600">
                {row.templateName} · v{row.templateVersion}
              </td>
              <td className="px-4 py-3 text-stone-500">{row.status}</td>
              <td className="px-4 py-3 font-mono text-xs text-stone-500">{row.publicPath}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/demos/${row.id}`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Apri
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
