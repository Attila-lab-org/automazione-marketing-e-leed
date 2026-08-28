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

type CommercialItem = {
  id: string;
  name: string;
  status: "READY" | "MISSING" | "INVALID";
  detail: string;
};

const TOOLTIPS: Record<string, string> = {
  supabase: "Database principale: conserva attività, campagne, anteprime e messaggi.",
  google_places: "Servizio usato per cercare nuove attività su Google.",
  resend: "Servizio usato per inviare le email. In modalità prova scrive solo agli indirizzi autorizzati.",
  telegram: "Bot Telegram per intercettare richieste (sito/e-commerce) e creare contatti da gestire.",
  browser_worker: "Servizio che analizza i siti e crea le immagini quando sarà attivato.",
  ai: "Classificazione e analisi interne. Non invia messaggi ai clienti.",
};

const PROVIDER_NAMES: Record<string, string> = {
  supabase: "Database",
  google_places: "Ricerca Google",
  resend: "Invio email",
  telegram: "Telegram inbound",
  browser_worker: "Analisi siti",
  ai: "AI commerciale",
};

const COMMERCIAL_NAMES: Record<string, string> = {
  owner_whatsapp: "Numero WhatsApp",
  owner_phone: "Numero per le chiamate",
  owner_contact_url: "Pagina di contatto",
  owner_offer_price: "Prezzo dell’offerta",
  owner_show_bridge: "Sezione commerciale nelle anteprime",
  resend_test_allowlist: "Indirizzi autorizzati per le prove",
  test_campaign_safety: "Protezione campagne di prova",
  app_url: "Indirizzo pubblico dell’app",
  resend_reply_path: "Risposte email (Reply-To)",
  resend_webhook: "Webhook email ricevute",
};

const CONFIG_STATUS: Record<CommercialItem["status"], string> = {
  READY: "Pronto",
  MISSING: "Da configurare",
  INVALID: "Non valido",
};

function providerDetail(item: ProviderItem): string {
  if (item.status === "ready") return "Collegato e pronto all’uso.";
  if (item.status === "mock") return "Funziona in modalità prova: non usa il servizio reale.";
  if (item.status === "not_configured") return item.detail;
  return item.detail || "Il collegamento ha un problema. Controlla la configurazione.";
}

function commercialDetail(item: CommercialItem): string {
  return item.detail;
}

export default function ProvidersRuntimeList({
  layout = "stack",
}: {
  layout?: "stack" | "grid";
}) {
  const [providers, setProviders] = useState<
    Array<ProviderItem & { health: ProviderHealth }>
  >([]);
  const [commercial, setCommercial] = useState<CommercialItem[]>([]);
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
        setCommercial((data.commercial as CommercialItem[]) ?? []);
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
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (providers.length === 0) {
    return <p className="text-sm text-stone-500">Verifica provider…</p>;
  }

  return (
    <div className="space-y-6">
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
            name={PROVIDER_NAMES[p.id] ?? p.name}
            status={p.health}
            tooltip={TOOLTIPS[p.id] ?? p.detail}
            detail={providerDetail(p)}
          />
        ))}
      </div>

      {commercial.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-800">
            Contatti e sicurezza delle prove
          </h3>
          <p className="text-xs text-stone-500">
            Per sicurezza, qui vedi soltanto se ogni voce è pronta, non i dati riservati.
          </p>
          <ul className="space-y-2">
            {commercial.map((c) => (
              <li
                key={c.id}
                title={`${COMMERCIAL_NAMES[c.id] ?? c.name}: ${commercialDetail(c)}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-stone-800">
                  {COMMERCIAL_NAMES[c.id] ?? c.name}
                </span>
                <span
                  className={
                    c.status === "READY"
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                      : c.status === "INVALID"
                        ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800"
                        : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
                  }
                >
                  {CONFIG_STATUS[c.status]}
                </span>
                <span className="w-full text-xs text-stone-500">
                  {commercialDetail(c)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
