"use client";

import { useEffect, useState } from "react";
import type {
  TelegramInboundSettings,
  TelegramKeywordGroups,
  TelegramOperationalMode,
} from "@/lib/inbound/telegram-settings";
import { resolveTelegramOperationalMode } from "@/lib/inbound/telegram-settings";

type Connection = {
  mode: string;
  ready: boolean;
  missing: string[];
  webhookUrl: string | null;
};

type OpsStats = {
  sent24h: number;
  draftsPending: number;
  errors24h: number;
  urgent: number;
};

type ApiResponse = {
  settings: TelegramInboundSettings;
  connection: Connection;
  operationalMode?: TelegramOperationalMode;
  stats?: OpsStats;
  message?: string;
  warning?: string | null;
};

const LABELS: Array<{ key: keyof TelegramKeywordGroups; label: string }> = [
  { key: "website", label: "Siti web" },
  { key: "ecommerce", label: "E-commerce" },
  { key: "digitalPresence", label: "Presenza online" },
  { key: "quote", label: "Preventivi e ricerca fornitori" },
];

function splitKeywords(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function modeBadge(mode: TelegramOperationalMode): { label: string; className: string } {
  if (mode === "auto_guarded") {
    return {
      label: "Automatico protetto",
      className: "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800",
    };
  }
  if (mode === "manual") {
    return {
      label: "Gestione manuale",
      className: "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900",
    };
  }
  return {
    label: "Fermo",
    className: "rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600",
  };
}

export default function TelegramControlPanel() {
  const [settings, setSettings] = useState<TelegramInboundSettings | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/settings/telegram", { cache: "no-store" });
        const data = (await response.json()) as ApiResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Stato Telegram non disponibile");
        }
        if (!cancelled) {
          setSettings(data.settings);
          setConnection(data.connection);
          setStats(data.stats ?? null);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Errore Telegram");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(showFeedback = true): Promise<boolean> {
    if (!settings) return false;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyEnabled: settings.replyEnabled,
          replyTemplate: settings.replyTemplate,
          keywords: settings.keywords,
        }),
      });
      const data = (await response.json()) as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Salvataggio fallito");
      setSettings(data.settings);
      setStats(data.stats ?? stats);
      if (showFeedback) setFeedback("Impostazioni salvate.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Salvataggio fallito");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error && !settings) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="font-semibold text-red-900">Telegram non disponibile</h2>
        <p className="mt-1 text-sm text-red-700">{error}</p>
      </section>
    );
  }

  if (!settings || !connection) {
    return <p className="text-sm text-stone-500">Caricamento controllo Telegram…</p>;
  }

  const mode = resolveTelegramOperationalMode(settings);
  const badge = modeBadge(mode);

  return (
    <section id="telegram" className="scroll-mt-24 space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-stone-900">Telegram</h2>
            <span className={badge.className}>{badge.label}</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            {mode === "auto_guarded"
              ? "Attila ascolta e risponde automaticamente alle conversazioni sicure. Appuntamento solo dopo interesse esplicito."
              : mode === "manual"
                ? "Attila ascolta e prepara le bozze: tu decidi se inviare. Nessun invio automatico."
                : "Telegram è fermo. Usa Accendi in alto in questa pagina o in Controllo."}
          </p>
          <p className="mt-1 max-w-2xl text-xs text-stone-500">
            Non può cercare in tutto Telegram: aggiungi il bot ai gruppi da monitorare e
            consentigli di leggere i messaggi tramite BotFather.
          </p>
        </div>
        <p className="shrink-0 text-sm text-stone-500">
          Accendi e spegni dal riquadro in alto.
        </p>
      </div>

      {stats ? (
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            { label: "Risposte inviate (24h)", value: stats.sent24h },
            { label: "Bozze da controllare", value: stats.draftsPending },
            { label: "Errori (24h)", value: stats.errors24h },
            { label: "Richieste urgenti", value: stats.urgent },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
            >
              <p className="text-xs text-stone-500">{item.label}</p>
              <p className="text-lg font-semibold text-stone-900">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!connection.ready ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Prima collega il bot su Vercel.</p>
          <p className="mt-1">
            Mancano: {connection.missing.join(", ")}. Una volta aggiunti questi dati,
            il pulsante “Avvia Telegram” si abilita.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="telegram-reply" className="text-sm font-semibold text-stone-800">
          Primo messaggio di riserva (solo se l’AI non risponde)
        </label>
        <textarea
          id="telegram-reply"
          rows={4}
          value={settings.replyTemplate}
          onChange={(event) =>
            setSettings({ ...settings, replyTemplate: event.target.value })
          }
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-500">
            Campi disponibili: {"{nome}"}, {"{studio}"}, {"{richiesta}"},{" "}
            {"{messaggio}"}.
          </p>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={settings.replyEnabled}
              onChange={(event) =>
                setSettings({ ...settings, replyEnabled: event.target.checked })
              }
            />
            Risposte AI automatiche (automatico protetto)
          </label>
        </div>
        <p className="text-xs text-stone-500">
          Se disattivi l’interruttore resti in gestione manuale: Attila ascolta ma non
          invia da solo. Prima di ogni invio automatico controlla stop, presa in carico,
          frequenza, duplicati e sicurezza.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Come trovare nuovi contatti</h3>
          <p className="text-xs text-stone-500">
            Scrivi parole o frasi separate da virgola. Servono soltanto per riconoscere
            il primo messaggio utile; non limitano le risposte successive.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {LABELS.map(({ key, label }) => (
            <label key={key} className="space-y-1 text-sm text-stone-700">
              <span className="font-medium">{label}</span>
              <textarea
                rows={3}
                value={settings.keywords[key].join(", ")}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    keywords: {
                      ...settings.keywords,
                      [key]: splitKeywords(event.target.value),
                    },
                  })
                }
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => save()}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          Salva modifiche
        </button>
        {feedback ? <p className="text-sm text-emerald-700">{feedback}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {connection.webhookUrl ? (
        <p className="break-all text-xs text-stone-400">
          Collegamento tecnico: {connection.webhookUrl}
        </p>
      ) : null}
    </section>
  );
}
