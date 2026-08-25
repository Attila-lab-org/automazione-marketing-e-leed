"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import type { InboxConversationDetail } from "@/lib/inbound/conversation";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function TelegramConversationDrawer({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: InboxConversationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Chiudi conversazione"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Dettagli conversazione Telegram"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-stone-200 bg-stone-50 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              {detail?.channel === "EMAIL" ? "Conversazione Email" : "Conversazione Telegram"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-900">
              {detail?.leadName ?? "Caricamento…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
          >
            Chiudi
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? <p className="text-sm text-stone-500">Caricamento dettagli…</p> : null}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {detail ? (
            <>
              {detail.humanRequiredReason ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold">HUMAN REQUIRED</p>
                  <p>{detail.humanRequiredReason}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {detail.commercialState ?? "NEW"}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {detail.assignedMode === "HUMAN" ? "HUMAN" : "AI"}
                </span>
                {detail.sentiment ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                    {detail.sentiment}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <HandoffButton threadId={detail.threadId} action="take_over" label="Prendi in carico" />
                <HandoffButton threadId={detail.threadId} action="return_to_ai" label="Ridai all’AI" />
                <HandoffButton threadId={detail.threadId} action="stop" label="Ferma automazione" />
              </div>
              <section className="grid gap-3 sm:grid-cols-2">
                <InfoCard title="Contatto">
                  <p className="font-medium text-stone-900">{detail.contact.displayName}</p>
                  <p className="text-stone-600">{detail.contact.handle ?? "Username non disponibile"}</p>
                  {detail.contact.telegramUrl ? (
                    <a
                      href={detail.contact.telegramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-medium text-sky-700 hover:underline"
                    >
                      Apri su Telegram →
                    </a>
                  ) : null}
                </InfoCard>
                <InfoCard title={detail.chat.isGroup ? "Gruppo" : "Chat"}>
                  <p className="font-medium text-stone-900">
                    {detail.chat.title ??
                      (detail.chat.isGroup ? "Gruppo senza titolo" : "Chat privata")}
                  </p>
                  <p className="text-stone-600">
                    {detail.chat.username ? `@${detail.chat.username}` : `ID ${detail.chat.id ?? "—"}`}
                  </p>
                  {detail.chat.telegramUrl ? (
                    <a
                      href={detail.chat.telegramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-medium text-sky-700 hover:underline"
                    >
                      Apri gruppo →
                    </a>
                  ) : null}
                </InfoCard>
              </section>

              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Stato risposta automatica
                  </h3>
                  <span
                    className={
                      detail.replyStatus.state === "SENT"
                        ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : detail.replyStatus.state === "FAILED"
                          ? "rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-800"
                          : "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                    }
                  >
                    {detail.replyStatus.label}
                  </span>
                </div>
                {detail.replyStatus.detail ? (
                  <p className="mt-2 text-sm text-stone-700">{detail.replyStatus.detail}</p>
                ) : null}
                {detail.replyStatus.occurredAt ? (
                  <p className="mt-1 text-xs text-stone-400">
                    {formatDate(detail.replyStatus.occurredAt)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-stone-500">
                  Intento: {detail.intent ?? "—"}
                  {detail.matchedKeywords.length
                    ? ` · Parole trovate: ${detail.matchedKeywords.join(", ")}`
                    : ""}
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Messaggi ({detail.messages.length})
                </h3>
                {detail.messages.length ? (
                  detail.messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.direction === "OUTBOUND"
                          ? "ml-8 rounded-xl bg-sky-100 p-3"
                          : "mr-8 rounded-xl border border-stone-200 bg-white p-3"
                      }
                    >
                      <p className="whitespace-pre-wrap text-sm text-stone-900">
                        {message.body}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        {message.deliveryLabel} · {formatDate(message.sentAt)}
                      </p>
                      {message.contextLabel ? (
                        <p className="mt-0.5 text-[11px] text-stone-400">
                          {message.contextLabel}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">Nessun messaggio registrato.</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Attività tecnica
                </h3>
                {detail.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-stone-800">{event.label}</p>
                    {event.detail ? (
                      <p className="text-xs text-stone-600">{event.detail}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-stone-400">
                      {formatDate(event.occurredAt)}
                    </p>
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function HandoffButton({
  threadId,
  action,
  label,
}: {
  threadId: string;
  action: "take_over" | "return_to_ai" | "stop";
  label: string;
}) {
  return (
    <button
      type="button"
      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
      onClick={() => {
        void fetch("/api/inbox/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, action }),
        });
      }}
    >
      {label}
    </button>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      {children}
    </div>
  );
}
