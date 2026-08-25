"use client";

import { useEffect, useState } from "react";
import type {
  TelegramInboundSettings,
  TelegramKeywordGroups,
} from "@/lib/inbound/telegram-settings";

type Connection = {
  mode: string;
  ready: boolean;
  missing: string[];
  webhookUrl: string | null;
};

type ApiResponse = {
  settings: TelegramInboundSettings;
  connection: Connection;
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

export default function TelegramControlPanel() {
  const [settings, setSettings] = useState<TelegramInboundSettings | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
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
      if (showFeedback) setFeedback("Impostazioni salvate.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Salvataggio fallito");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeRunning(action: "start" | "stop") {
    if (!settings) return;
    if (action === "start" && !(await save(false))) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Operazione fallita");
      setSettings(data.settings);
      setConnection(data.connection);
      setFeedback(data.warning ?? data.message ?? "Operazione completata.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operazione fallita");
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

  return (
    <section id="telegram" className="scroll-mt-24 space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-stone-900">Telegram</h2>
            <span
              className={
                settings.enabled
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                  : "rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600"
              }
            >
              {settings.enabled ? "Attivo" : "Fermo"}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            {settings.enabled
              ? "Telegram è acceso: Attila ascolta le chat collegate, risponde ai contatti e porta avanti la conversazione fino all’appuntamento."
              : "Telegram è fermo. Completa i passaggi richiesti e premi “Avvia Telegram”: senza quel pulsante Attila non legge e non risponde."}
          </p>
          <p className="mt-1 max-w-2xl text-xs text-stone-500">
            Non può cercare in tutto Telegram: devi aggiungere il bot ai gruppi che
            vuoi monitorare e consentirgli di leggere i messaggi tramite BotFather.
          </p>
        </div>
        {settings.enabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeRunning("stop")}
            className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? "Attendi…" : "Ferma Telegram"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !connection.ready}
            onClick={() => changeRunning("start")}
            className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Attendi…" : "Avvia Telegram"}
          </button>
        )}
      </div>

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
          Primo messaggio ai nuovi contatti
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
            Contatta automaticamente i nuovi contatti trovati
          </label>
        </div>
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
