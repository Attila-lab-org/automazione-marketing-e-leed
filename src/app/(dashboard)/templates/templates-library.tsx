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

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  archived: "Archiviato",
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
        if (!res.ok) throw new Error(data.error ?? "Caricamento modelli fallito");
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

  if (loading) return <p className="text-sm text-stone-500">Caricamento modelli…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Messaggio commerciale
              </p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">
                Email con proposta, prezzo e contatto diretto
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              Attivo
            </span>
          </div>
        </div>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Oggetto mostrato al cliente
            </p>
            <p className="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-semibold text-stone-900">
              Nome attività — una proposta pronta da vedere
            </p>
            <div className="mt-5 rounded-xl bg-stone-950 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
                La proposta per te
              </p>
              <p className="mt-2 font-serif text-2xl">Il tuo sito da 350 €</p>
              <p className="mt-1 text-sm text-stone-300">Consegna in 24 ore</p>
              <p className="mt-4 text-sm leading-relaxed text-stone-200">
                Come contattarmi: un messaggio su WhatsApp o una chiamata. Ti rispondo io.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-stone-950">
                  Guarda la proposta
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-2 text-xs font-bold text-[#062816]">
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"
                    />
                  </svg>
                  Scrivimi su WhatsApp
                </span>
                <span className="rounded-lg border border-stone-600 px-3 py-2 text-xs font-bold text-white">
                  Chiamami
                </span>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-stone-300">
                Chi siamo: Attila Lab ·{' '}
                <span className="font-semibold text-white underline">attila-lab.net</span>
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Come viene gestita
            </p>
            <ol className="mt-3 space-y-3">
              {[
                "Presenta l’idea in modo personale e senza termini tecnici.",
                "Mostra subito prezzo base e tempo di consegna.",
                "Fa vedere l’anteprima preparata per l’attività.",
                "Spiega come contattarti: WhatsApp o chiamata, senza moduli.",
                "Dice chi siamo e lascia il sito attila-lab.net da aprire.",
              ].map((item, index) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-stone-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
            <Link
              href="/demos"
              className="mt-5 inline-flex rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              Vedi le anteprime reali
            </Link>
          </div>
        </div>
      </section>

      <div>
        <h2 className="mb-3 text-base font-semibold text-stone-900">Modelli del sito</h2>
        <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.id}
          title={`${row.name}: modello grafico usato per creare le anteprime.`}
          tabIndex={0}
          className="rounded-xl border border-stone-200 bg-white p-5 outline-none hover:border-amber-300 focus:ring-2 focus:ring-amber-100"
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
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            {row.description ?? "Modello grafico di base. Le anteprime già create restano legate alla versione usata."}
          </p>
          <p className="mt-4 text-xs text-stone-400">{row.demoCount} anteprime collegate</p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/demos"
              title="Vedi tutte le anteprime create con i modelli disponibili."
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Vedi anteprime
            </Link>
            <Link
              href="/leads"
              title="Scegli un’attività e crea una nuova anteprima."
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
            >
              Crea da un’attività
            </Link>
          </div>
        </article>
      ))}
        </div>
      </div>
    </div>
  );
}
