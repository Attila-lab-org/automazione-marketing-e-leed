"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Communication = {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: "EMAIL" | "TELEGRAM";
  leadName: string;
  address: string;
  subject: string | null;
  preview: string;
  occurredAt: string;
  status: string;
  campaign: { id: string; name: string; deliveryMode: "TEST" | "PRODUCTION" } | null;
};

const STATUS_LABEL: Record<string, string> = {
  SENT: "Inviata",
  DELIVERED: "Consegnata",
  OPENED: "Aperta",
  CLICKED: "Cliccata",
  BOUNCED: "Respinta",
  COMPLAINED: "Segnalata",
  REPLIED: "Risposta",
  RECEIVED: "Ricevuta",
};

export default function RecentCommunicationsCard() {
  const [items, setItems] = useState<Communication[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard/communications", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Comunicazioni non disponibili");
        setItems(data.communications ?? []);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Comunicazioni non disponibili"),
      );
  }, []);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-950">Ultime comunicazioni</h2>
          <p className="mt-1 text-sm text-stone-600">
            Chi, cosa e quando. Apri una riga per vedere l’intera conversazione.
          </p>
        </div>
        <Link href="/inbox" className="text-sm font-semibold text-amber-800">
          Vedi tutte
        </Link>
      </div>
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {!error && items.length === 0 ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Nessuna email o conversazione registrata.
        </p>
      ) : null}
      {items.length ? (
        <ul className="mt-4 divide-y divide-stone-100">
          {items.slice(0, 4).map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/inbox?thread=${encodeURIComponent(item.threadId)}`}
                      className="font-semibold text-stone-900 hover:text-amber-800"
                    >
                      {item.leadName}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.status === "BOUNCED" || item.status === "COMPLAINED"
                          ? "bg-red-50 text-red-800"
                          : item.direction === "OUTBOUND"
                          ? "bg-blue-50 text-blue-800"
                          : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {STATUS_LABEL[item.status] ?? item.status} · {item.channel}
                    </span>
                    {item.campaign?.deliveryMode === "TEST" ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        TEST
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-stone-700">
                    {item.subject ?? "Senza oggetto"}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-stone-500">
                    {item.preview || "Nessuna anteprima disponibile"}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-400">
                    {item.direction === "OUTBOUND" ? "A" : "Da"}: {item.address}
                    {item.campaign ? ` · ${item.campaign.name}` : ""}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-stone-400">
                  {new Date(item.occurredAt).toLocaleString("it-IT")}
                </time>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
