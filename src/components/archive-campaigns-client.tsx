"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";

type Campaign = {
  id: string;
  name: string;
  status: string;
  mode: string;
  created_at: string;
  updated_at?: string;
  lead_count: number;
  categories: string[];
};

export default function ArchiveCampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/campaigns?archived=1");
      const data = await response.json();
      setCampaigns(data.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(campaign: Campaign) {
    setBusyId(campaign.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchive" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ripristino fallito");
      setFeedback(`«${campaign.name}» ripristinata (in pausa). La trovi in Campagne.`);
      await load();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Carico l’archivio campagne…</p>;
  }

  if (!campaigns.length) {
    return (
      <EmptyState
        title="Nessuna campagna archiviata"
        description="Quando archivi una campagna dalla sezione Campagne, compare qui."
        nextAction={{ label: "Vai alle campagne", href: "/campaigns" }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {feedback ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          {feedback}{" "}
          <Link href="/campaigns" className="font-medium text-stone-900 underline">
            Vai alle campagne
          </Link>
        </p>
      ) : null}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {campaigns.map((campaign) => (
          <li
            key={campaign.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <Link
                href={`/campaigns/${campaign.id}`}
                className="truncate text-sm font-semibold text-stone-900 hover:underline"
              >
                {campaign.name}
              </Link>
              <p className="mt-0.5 text-xs text-stone-500">
                {campaign.lead_count} contatti
                {campaign.categories.length
                  ? ` · ${campaign.categories.slice(0, 3).join(", ")}`
                  : ""}
                {campaign.updated_at
                  ? ` · archiviata ${new Date(campaign.updated_at).toLocaleDateString("it-IT")}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === campaign.id}
              onClick={() => void restore(campaign)}
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              {busyId === campaign.id ? "Ripristino…" : "Ripristina"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
