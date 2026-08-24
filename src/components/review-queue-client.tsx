"use client";

import { useCallback, useEffect, useState } from "react";
import ReviewCard from "@/components/review-card";
import EmptyState from "@/components/empty-state";

type QueueItem = {
  id: string;
  companyName: string;
  category: string;
  city: string;
  score: number;
  confidence: number;
  subject: string;
  messagePreview: string;
  previewImageUrl: string | null;
  email: string | null;
  blockers: string[];
};

export default function ReviewQueueClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/review-queue");
    const data = await r.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review-queue")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(id: string, action: "approve" | "skip" | "stop") {
    await fetch("/api/review-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignLeadId: id, action }),
    });
    await refresh();
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Caricamento coda review…</p>;
  }

  if (!items.length) {
    return (
      <EmptyState
        title="Nessun lead in review"
        description="Crea una campagna e avvia la preparazione bulk per popolare la coda con demo ed email reali."
        nextAction={{ label: "Vai alle campagne", href: "/campaigns" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ReviewCard
          key={item.id}
          companyName={item.companyName}
          category={item.category}
          city={item.city}
          score={item.score}
          confidence={item.confidence}
          subject={item.subject}
          messagePreview={item.messagePreview}
          thumbnailLabel={item.previewImageUrl ? "Anteprima email" : undefined}
          signals={[
            {
              label: item.email ? "Email trovata" : "Email mancante",
              ok: Boolean(item.email),
              tooltip: item.email ?? "Enrichment email non ha trovato un indirizzo pubblico.",
            },
            {
              label: item.previewImageUrl ? "Preview pronta" : "Preview assente",
              ok: Boolean(item.previewImageUrl),
            },
            {
              label: item.blockers.length ? `Blocchi: ${item.blockers.join(", ")}` : "Pronto per review",
              ok: item.blockers.length === 0,
            },
          ]}
          onApprove={() => void act(item.id, "approve")}
          onSkip={() => void act(item.id, "skip")}
          onReject={() => void act(item.id, "stop")}
        />
      ))}
    </div>
  );
}
