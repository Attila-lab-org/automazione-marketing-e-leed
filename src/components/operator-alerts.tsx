"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CommercialAlert = {
  id: string;
  kind: string;
  title: string;
  reason: string;
  href: string;
  createdAt: string;
  leadName?: string | null;
  priority?: "high" | "normal";
};

type Props = {
  /** Su Telegram mostra solo chat rilevanti; in Controllo anche follow-up. */
  channel?: "telegram" | "all";
  title?: string;
  limit?: number;
};

export default function OperatorAlerts({
  channel = "all",
  title = "Da fare ora",
  limit = 5,
}: Props) {
  const [alerts, setAlerts] = useState<CommercialAlert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetch(`/api/sales/alerts?channel=${channel}&limit=${limit}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoaded(true));
  }, [channel, limit]);

  if (!loaded || !alerts.length) return null;

  return (
    <section aria-label="Avvisi commerciali" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
        <p className="text-xs text-stone-400">{alerts.length} in evidenza</p>
      </div>
      <ul className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {alerts.map((row, index) => (
          <li
            key={row.id}
            className={
              index === 0
                ? "border-b border-stone-100 last:border-b-0"
                : "border-b border-stone-100 last:border-b-0"
            }
          >
            <Link
              href={row.href}
              className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-stone-50"
            >
              <span
                className={
                  row.priority === "high"
                    ? "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                    : "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-stone-300"
                }
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900">
                  {row.leadName ? (
                    <>
                      <span>{row.leadName}</span>
                      <span className="font-normal text-stone-400"> · {row.title}</span>
                    </>
                  ) : (
                    row.title
                  )}
                </p>
                <p className="truncate text-xs text-stone-500">{row.reason}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-stone-400 group-hover:text-stone-700">
                Apri
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
