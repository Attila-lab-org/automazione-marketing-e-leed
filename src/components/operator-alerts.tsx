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
};

export default function OperatorAlerts() {
  const [alerts, setAlerts] = useState<CommercialAlert[]>([]);

  useEffect(() => {
    void fetch("/api/sales/alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts.slice(0, 8) : []);
      })
      .catch(() => setAlerts([]));
  }, []);

  if (!alerts.length) return null;

  return (
    <section aria-label="Avvisi commerciali" className="space-y-3">
      <h2 className="text-sm font-semibold text-stone-800">Cosa sta succedendo</h2>
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {alerts.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-stone-900">
                {row.title}
                {row.leadName ? (
                  <span className="font-normal text-stone-500"> · {row.leadName}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">{row.reason}</p>
            </div>
            <Link
              href={row.href}
              className="shrink-0 text-xs font-semibold text-amber-800 hover:underline"
            >
              Apri
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
