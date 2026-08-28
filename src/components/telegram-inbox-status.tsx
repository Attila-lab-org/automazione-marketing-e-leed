"use client";

import { useEffect, useState } from "react";

type TelegramStatus = {
  settings: { enabled: boolean };
  connection: { ready: boolean; missing: string[] };
  message?: string;
  warning?: string | null;
};

export default function TelegramInboxStatus() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/settings/telegram", { cache: "no-store" });
    if (!response.ok) return;
    setStatus((await response.json()) as TelegramStatus);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function start() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = (await response.json()) as TelegramStatus & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Avvio non riuscito");
      setStatus(data);
      setFeedback(data.warning ?? data.message ?? "Telegram attivo.");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Avvio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section
      className={
        status.settings.enabled
          ? "flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div>
        <p className={status.settings.enabled ? "text-sm font-semibold text-emerald-900" : "text-sm font-semibold text-amber-900"}>
          Telegram {status.settings.enabled ? "è attivo" : "è fermo"}
        </p>
        <p className={status.settings.enabled ? "text-xs text-emerald-800" : "text-xs text-amber-800"}>
          {status.settings.enabled
            ? "Attila ascolta le chat collegate e gestisce le conversazioni sicure."
            : status.connection.ready
              ? "Avvialo per ricevere e gestire i messaggi dalle chat collegate."
              : "Completa prima il collegamento del bot nelle Impostazioni."}
        </p>
        {feedback ? <p className="mt-1 text-xs font-medium">{feedback}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        {!status.settings.enabled && status.connection.ready ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Avvio…" : "Avvia Telegram"}
          </button>
        ) : null}
        <a
          href="/telegram"
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
        >
          Configura
        </a>
      </div>
    </section>
  );
}
