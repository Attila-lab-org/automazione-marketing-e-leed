"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CityBoard, CityBoardRow } from "@/lib/campaigns/city-board";

function cityHref(path: string, city: string): string {
  return `${path}?citta=${encodeURIComponent(city)}`;
}

export default function CityBoard() {
  const [board, setBoard] = useState<CityBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/city-board", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Quadro campagna non disponibile");
        if (!cancelled) setBoard(data as CityBoard);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Quadro campagna non disponibile");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-950">La campagna</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Una riga è una città. Vedi chi è già in elenco, a chi è uscita la mail e chi non ha risposto. La seconda mail non parte da sola.
          </p>
        </div>
        <Link
          href="/leads"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
        >
          Cerca una città
        </Link>
      </div>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {!board && !error ? <p className="mt-4 text-sm text-stone-500">Carico il quadro della campagna…</p> : null}

      {board ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-stone-50 px-3 py-3">
              <dt className="text-xs text-stone-500">Mail uscite</dt>
              <dd className="text-2xl font-semibold text-stone-950">{board.totals.sent}</dd>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-3">
              <dt className="text-xs text-stone-500">Senza risposta</dt>
              <dd className="text-2xl font-semibold text-stone-950">{board.totals.noReply}</dd>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-3">
              <dt className="text-xs text-stone-500">Hanno risposto</dt>
              <dd className="text-2xl font-semibold text-stone-950">{board.totals.replied}</dd>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-3">
              <dt className="text-xs text-stone-500">Pronte da inviare</dt>
              <dd className="text-2xl font-semibold text-stone-950">{board.totals.ready}</dd>
            </div>
          </dl>

          {board.rows.length === 0 ? (
            <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
              Non hai ancora cercato una città. Da «Cerca una città» scegli il settore e la città.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-stone-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Città</th>
                    <th className="py-2 pr-3 font-medium">In elenco</th>
                    <th className="py-2 pr-3 font-medium">Con email</th>
                    <th className="py-2 pr-3 font-medium">Uscite</th>
                    <th className="py-2 pr-3 font-medium">Senza risposta</th>
                    <th className="py-2 pr-3 font-medium">Risposte</th>
                    <th className="py-2 pr-3 font-medium">Pronte</th>
                    <th className="py-2 font-medium">Prossimo passo</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row) => (
                    <CityRow key={row.city} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function CityRow({ row }: { row: CityBoardRow }) {
  const next = row.ready > 0
    ? { href: cityHref("/review-queue", row.city), label: `Invia ${row.ready}` }
    : { href: cityHref("/leads", row.city), label: row.searched ? "Cerca ancora" : "Apri" };

  return (
    <tr className="border-t border-stone-100">
      <td className="py-3 pr-3 font-medium text-stone-900">
        <Link href={cityHref("/leads", row.city)} className="hover:text-amber-800">
          {row.city}
        </Link>
      </td>
      <td className="py-3 pr-3 text-stone-700">{row.contacts}</td>
      <td className="py-3 pr-3 text-stone-700">{row.withEmail}</td>
      <td className="py-3 pr-3 text-stone-700">{row.sent}</td>
      <td className="py-3 pr-3 text-stone-700">{row.noReply}</td>
      <td className="py-3 pr-3 text-stone-700">{row.replied}</td>
      <td className="py-3 pr-3 text-stone-700">{row.ready}</td>
      <td className="py-3">
        <Link href={next.href} className="font-semibold text-amber-800 hover:underline">
          {next.label}
        </Link>
      </td>
    </tr>
  );
}
