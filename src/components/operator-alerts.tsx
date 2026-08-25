"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AlertRow = {
  threadId: string;
  leadName: string;
  commercialState: string | null;
  humanRequiredReason: string | null;
  priority: string | null;
};

export default function OperatorAlerts() {
  const [rows, setRows] = useState<AlertRow[]>([]);

  useEffect(() => {
    void fetch("/api/inbox", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const threads = (data.threads ?? []) as AlertRow[];
        setRows(
          threads.filter(
            (t) => t.humanRequiredReason || t.priority === "HOT" || t.commercialState === "HUMAN_REQUIRED",
          ).slice(0, 6),
        );
      })
      .catch(() => setRows([]));
  }, []);

  if (!rows.length) return null;

  return (
    <section aria-label="Avvisi Attila" className="space-y-3">
      <h2 className="text-sm font-semibold text-stone-800">Avvisi commerciali</h2>
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {rows.map((row) => (
          <li key={row.threadId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-stone-900">{row.leadName}</p>
              <p className="text-xs text-stone-500">
                {row.humanRequiredReason ?? row.commercialState ?? row.priority}
              </p>
            </div>
            <Link href="/inbox" className="text-xs font-semibold text-amber-800 hover:underline">
              Apri Messaggi
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
