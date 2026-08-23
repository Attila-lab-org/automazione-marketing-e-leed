"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  vertical: string | null;
  status: "draft" | "published" | "archived" | string;
  latestVersion: number | null;
  publishedVersion: number | null;
  demoCount: number;
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-stone-200 bg-stone-50 text-stone-600",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-stone-200 bg-stone-100 text-stone-500",
};

export default function TemplatesLibrary() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Elenco template fallito");
        if (!cancelled) setRows(data.templates ?? []);
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

  if (loading) return <p className="text-sm text-stone-500">Caricamento template…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded-xl border border-stone-200 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-900">{row.name}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {row.vertical ?? "—"} · versione {row.publishedVersion ?? row.latestVersion ?? "—"}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[row.status] ?? STATUS_STYLE.draft}`}
            >
              {row.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            {row.description ?? "Master template in codice. Le demo restano legate alla versione usata alla creazione."}
          </p>
          <p className="mt-4 text-xs text-stone-400">{row.demoCount} demo collegate</p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/demos"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Vedi demo
            </Link>
            <Link
              href="/leads"
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
            >
              Crea da un lead
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
