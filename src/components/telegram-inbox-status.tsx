"use client";

import { useEffect, useState } from "react";
import type { TelegramOperationalMode } from "@/lib/inbound/telegram-settings";

type TelegramStatus = {
  settings: { enabled: boolean; replyEnabled: boolean };
  connection: { ready: boolean; missing: string[] };
  operationalMode?: TelegramOperationalMode;
  stats?: {
    sent24h: number;
    draftsPending: number;
    errors24h: number;
    urgent: number;
  };
  message?: string;
  warning?: string | null;
};

type Props = {
  /** Se true, il pulsante Configura scrolla alla sezione locale invece di /telegram. */
  configHref?: string;
};

function modeCopy(mode: TelegramOperationalMode | undefined, enabled: boolean) {
  if (!enabled || mode === "stopped") {
    return {
      title: "Telegram è fermo",
      body: "Avvialo per ricevere e gestire i messaggi dalle chat collegate.",
      active: false,
    };
  }
  if (mode === "manual") {
    return {
      title: "Gestione manuale",
      body: "Ascolta e prepara bozze: nessun invio automatico.",
      active: true,
    };
  }
  return {
    title: "Automatico protetto",
    body: "Risponde alle chat sicure. Chiamata solo dopo interesse esplicito.",
    active: true,
  };
}

export default function TelegramInboxStatus({ configHref = "#telegram-config" }: Props) {
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

  const copy = modeCopy(status.operationalMode, status.settings.enabled);
  const stats = status.stats;
  const showStats =
    Boolean(stats) &&
    (stats!.sent24h > 0 || stats!.draftsPending > 0 || stats!.errors24h > 0 || stats!.urgent > 0);

  return (
    <section
      className={
        copy.active
          ? "flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="min-w-0">
        <p
          className={
            copy.active
              ? "text-sm font-semibold text-emerald-950"
              : "text-sm font-semibold text-amber-950"
          }
        >
          {copy.title}
        </p>
        <p
          className={
            copy.active ? "mt-0.5 text-xs text-emerald-900/80" : "mt-0.5 text-xs text-amber-900/80"
          }
        >
          {!status.settings.enabled && !status.connection.ready
            ? "Completa prima il collegamento del bot nelle Impostazioni."
            : copy.body}
        </p>
        {showStats ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "Inviate", value: stats!.sent24h },
              { label: "Bozze", value: stats!.draftsPending },
              { label: "Errori", value: stats!.errors24h },
              { label: "Urgenti", value: stats!.urgent },
            ]
              .filter((item) => item.value > 0)
              .map((item) => (
                <span
                  key={item.label}
                  className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200/80"
                >
                  {item.label} {item.value}
                </span>
              ))}
          </div>
        ) : null}
        {feedback ? <p className="mt-1 text-xs font-medium text-stone-800">{feedback}</p> : null}
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
          href={configHref}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
        >
          Configura
        </a>
      </div>
    </section>
  );
}
