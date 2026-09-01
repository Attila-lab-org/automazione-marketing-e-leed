"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramOperationalMode } from "@/lib/inbound/telegram-settings";

type TelegramStatus = {
  settings: { enabled: boolean; replyEnabled: boolean };
  connection: { ready: boolean; missing: string[] };
  operationalMode?: TelegramOperationalMode;
  message?: string;
  warning?: string | null;
};

export default function TelegramPowerControl({
  showChatLink = false,
}: {
  showChatLink?: boolean;
}) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/settings/telegram", { cache: "no-store" });
    const data = (await response.json()) as TelegramStatus & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Stato Telegram non disponibile");
    setStatus(data);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((reason) =>
        setFeedback(reason instanceof Error ? reason.message : "Errore Telegram"),
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function setRunning(action: "start" | "stop") {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as TelegramStatus & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Operazione non riuscita");
      setStatus(data);
      setFeedback(data.warning ?? data.message ?? (action === "start" ? "Telegram acceso." : "Telegram spento."));
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function setMode(auto: boolean) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyEnabled: auto }),
      });
      const data = (await response.json()) as TelegramStatus & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Salvataggio non riuscito");
      setStatus((current) =>
        current
          ? {
              ...current,
              settings: data.settings,
              operationalMode: data.operationalMode,
            }
          : data,
      );
      setFeedback(auto ? "Risponde da solo, con i controlli di sicurezza." : "Ascolta, ma tu decidi se inviare.");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-base font-semibold text-stone-900">Telegram</h2>
        <p className="mt-2 text-sm text-stone-500">Carico lo stato…</p>
      </section>
    );
  }

  const on = status.settings.enabled;
  const ready = status.connection.ready;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Telegram</h2>
          <p className="mt-1 text-sm text-stone-600">
            {on
              ? status.settings.replyEnabled
                ? "Acceso. Attila ascolta e risponde alle chat sicure."
                : "Acceso. Attila ascolta e prepara le bozze: tu invii."
              : "Spento. Nessun messaggio viene ascoltato o inviato."}
          </p>
        </div>
        <span
          className={
            on
              ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
              : "rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600"
          }
        >
          {on ? "Acceso" : "Spento"}
        </span>
      </div>

      {!ready ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prima collega il bot in Impostazioni. Mancano: {status.connection.missing.join(", ")}.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || on || !ready}
          onClick={() => void setRunning("start")}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && !on ? "Accendo…" : "Accendi"}
        </button>
        <button
          type="button"
          disabled={busy || !on}
          onClick={() => void setRunning("stop")}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && on ? "Spengo…" : "Spegni"}
        </button>
      </div>

      {on ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Come risponde</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setMode(true)}
              className={
                status.settings.replyEnabled
                  ? "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700"
              }
            >
              Automatico
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setMode(false)}
              className={
                !status.settings.replyEnabled
                  ? "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700"
              }
            >
              Manuale
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="mt-3 text-sm text-stone-700">{feedback}</p> : null}

      {showChatLink ? (
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/inbox?channel=telegram" className="text-stone-900 underline">
            Messaggi Telegram
          </Link>
          <Link href="/telegram#telegram-config" className="text-stone-600 underline">
            Configura bot
          </Link>
        </div>
      ) : null}
    </section>
  );
}
