"use client";

import { useEffect, useState } from "react";
import ProviderStatus, {
  mapRuntimeStatus,
  type ProviderHealth,
} from "@/components/provider-status";

type ProviderItem = {
  id: string;
  name: string;
  status: "ready" | "mock" | "error" | "not_configured";
  detail: string;
};

const TOOLTIPS: Record<string, string> = {
  supabase: "System of record: probe su workspaces.",
  google_places: "Places API (New) Text Search — stato runtime.",
  resend: "Outreach email: mock in questo slice.",
  browser_worker: "Analisi/screenshot: mock in questo slice.",
  ai: "AI messaging: mock in questo slice.",
};

export default function ProvidersRuntimeList({
  layout = "stack",
}: {
  layout?: "stack" | "grid";
}) {
  const [providers, setProviders] = useState<
    Array<ProviderItem & { health: ProviderHealth }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/providers/status", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Status non disponibile");
        if (cancelled) return;
        setProviders(
          (data.providers as ProviderItem[]).map((p) => ({
            ...p,
            health: mapRuntimeStatus(p.status),
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Errore status");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-sm text-red-600">{error}</p>
    );
  }

  if (providers.length === 0) {
    return <p className="text-sm text-stone-500">Verifica provider…</p>;
  }

  return (
    <div
      className={
        layout === "grid"
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          : "space-y-3"
      }
    >
      {providers.map((p) => (
        <ProviderStatus
          key={p.id}
          name={p.name}
          status={p.health}
          tooltip={TOOLTIPS[p.id] ?? p.detail}
          detail={p.detail}
        />
      ))}
    </div>
  );
}
