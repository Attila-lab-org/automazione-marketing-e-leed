"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";

type FollowupItem = {
  campaignLeadId: string;
  campaignId: string;
  campaignName: string;
  leadName: string;
  sequenceStep: number;
  nextActionAt: string | null;
  status: string;
  due: boolean;
  inReview: boolean;
};

export default function FollowUpsClient() {
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/follow-ups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Caricamento fallito");
      setItems(data.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function prepare(item: FollowupItem) {
    setBusyId(item.campaignLeadId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${item.campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_followup",
          campaignLeadId: item.campaignLeadId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Preparazione fallita");
      setMessage(data.message ?? "Bozza pronta nella coda di controllo.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Caricamento follow-up…</p>;
  if (error && !items.length) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const due = items.filter((item) => item.due && !item.inReview);
  const inReview = items.filter((item) => item.inReview);
  const upcoming = items.filter((item) => !item.due && !item.inReview);

  if (!items.length) {
    return (
      <EmptyState
        title="Nessun follow-up in coda"
        description="Compariranno qui dopo il primo invio email, a +3 e +7 giorni, solo se il cliente non ha risposto."
        nextAction={{ label: "Vai alle campagne", href: "/campaigns" }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}{" "}
          <Link href="/review-queue" className="font-semibold underline">
            Apri da controllare
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <FollowupSection
        title="Da preparare ora"
        description="Il tempo è scaduto: prepara la bozza personalizzata, poi approvala."
        items={due}
        busyId={busyId}
        onPrepare={prepare}
        empty="Nessun follow-up scaduto in questo momento."
      />
      <FollowupSection
        title="In coda di controllo"
        description="Bozze già preparate: aprirle, modificarle e approvare l’invio."
        items={inReview}
        busyId={busyId}
        onPrepare={prepare}
        reviewMode
        empty="Nessuna bozza follow-up in revisione."
      />
      <FollowupSection
        title="In arrivo"
        description="Ancora non scaduti: restano in attesa senza invio automatico."
        items={upcoming}
        busyId={busyId}
        onPrepare={prepare}
        empty="Nessun follow-up programmato."
      />
    </div>
  );
}

function FollowupSection({
  title,
  description,
  items,
  busyId,
  onPrepare,
  reviewMode,
  empty,
}: {
  title: string;
  description: string;
  items: FollowupItem[];
  busyId: string | null;
  onPrepare: (item: FollowupItem) => void;
  reviewMode?: boolean;
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-sm text-stone-500">{description}</p>
      {items.length ? (
        <ul className="mt-4 divide-y divide-stone-100">
          {items.map((item) => (
            <li
              key={item.campaignLeadId}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-stone-900">{item.leadName}</p>
                <p className="text-xs text-stone-500">
                  {item.campaignName} · follow-up {item.sequenceStep}
                  {item.nextActionAt
                    ? ` · ${new Date(item.nextActionAt).toLocaleString("it-IT")}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {reviewMode ? (
                  <Link
                    href="/review-queue"
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Controlla bozza
                  </Link>
                ) : item.due ? (
                  <button
                    type="button"
                    disabled={busyId === item.campaignLeadId}
                    onClick={() => onPrepare(item)}
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === item.campaignLeadId ? "Preparazione…" : "Prepara bozza"}
                  </button>
                ) : (
                  <span className="rounded-lg bg-stone-100 px-3 py-2 text-xs font-medium text-stone-500">
                    In attesa
                  </span>
                )}
                <Link
                  href={`/campaigns/${item.campaignId}`}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700"
                >
                  Campagna
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-stone-500">{empty}</p>
      )}
    </section>
  );
}
