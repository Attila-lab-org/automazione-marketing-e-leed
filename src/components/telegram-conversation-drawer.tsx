"use client";

import { useEffect, useState } from "react";
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
  onChanged,
}: {
  detail: InboxConversationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
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
              {detail.aiDraft?.text ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Stato commerciale Attila
                  </h3>
                  <p className="text-sm text-stone-800">
                    <span className="font-semibold">Obiettivo attuale:</span> {detail.aiDraft.understanding}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-stone-800">
                    <span className="font-semibold">Prossima risposta:</span> {detail.aiDraft.text}
                  </p>
                  <p className="text-xs text-stone-600">
                    Stato: {detail.commercialState ?? detail.aiDraft.state}
                    {detail.nextStep ? ` · Prossimo passo: ${detail.nextStep}` : ""}
                  </p>
                </section>
              ) : null}

              {(detail.appointment || detail.nextDeadline) ? (
                <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                    Calendario collegato
                  </h3>
                  {detail.appointment ? (
                    <p className="text-sm text-stone-800">
                      <span className="font-semibold">Appuntamento:</span> {detail.appointment.title} ·{" "}
                      {formatDate(detail.appointment.startsAt)}
                    </p>
                  ) : (
                    <p className="text-sm text-stone-600">Nessun appuntamento fissato.</p>
                  )}
                  {detail.nextDeadline ? (
                    <p className="text-sm text-stone-800">
                      <span className="font-semibold">Prossima scadenza:</span> {detail.nextDeadline.title} ·{" "}
                      {formatDate(detail.nextDeadline.dueAt)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={
                        detail.appointment?.startsAt
                          ? `/calendar?week=${encodeURIComponent(detail.appointment.startsAt.slice(0, 10))}&focus=${encodeURIComponent(detail.appointment.id)}`
                          : "/calendar"
                      }
                      className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800"
                    >
                      Apri nel calendario
                    </a>
                    {detail.appointment ? (
                      <>
                        <CalendarActionButton
                          eventId={detail.appointment.id}
                          leadId={detail.leadId}
                          threadId={detail.threadId}
                          action="reschedule"
                          label="Riprogramma"
                        />
                        <CalendarActionButton
                          eventId={detail.appointment.id}
                          leadId={detail.leadId}
                          threadId={detail.threadId}
                          action="cancel"
                          label="Annulla"
                        />
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {detail.humanRequiredReason ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold">Serve una tua risposta</p>
                  <p>{detail.humanRequiredReason}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {detail.commercialState === "CALL_BOOKED"
                    ? "Appuntamento fissato"
                    : detail.commercialState === "FOLLOW_UP_LATER"
                      ? "Da ricontattare"
                      : detail.commercialState === "HUMAN_REQUIRED"
                        ? "Serve intervento"
                        : detail.commercialState ?? "Nuovo"}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {detail.assignedMode === "HUMAN" ? "Gestione manuale" : "Attila attivo"}
                </span>
                {detail.sentiment ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                    {detail.sentiment}
                  </span>
                ) : null}
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <p className="text-sm font-semibold text-stone-900">
                  {detail.assignedMode === "HUMAN"
                    ? "Attila è fermo su questa conversazione"
                    : "Attila gestisce questa conversazione"}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  {detail.assignedMode === "HUMAN"
                    ? "Riattivalo: analizzerà l’ultimo messaggio senza risposta e, se sicuro, risponderà subito."
                    : "Passa alla gestione manuale solo se vuoi rispondere personalmente al cliente."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {detail.assignedMode === "HUMAN" ? (
                    <HandoffButton
                      threadId={detail.threadId}
                      action="return_to_ai"
                      label="Attiva Attila e rispondi ora"
                      onDone={onChanged}
                    />
                  ) : (
                    <HandoffButton
                      threadId={detail.threadId}
                      action="take_over"
                      label="Gestisci tu"
                      onDone={onChanged}
                    />
                  )}
                  <HandoffButton
                    threadId={detail.threadId}
                    action="stop"
                    label="Chiudi e ferma automazione"
                    confirmMessage="Vuoi chiudere questa conversazione e fermare ogni automazione sul contatto?"
                    onDone={onChanged}
                  />
                </div>
              </div>
              {detail.channel === "EMAIL" ? (
                <ManualEmailReply threadId={detail.threadId} />
              ) : null}
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
                  Cronologia operativa
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

function ManualEmailReply({ threadId }: { threadId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(threadId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Invio non riuscito");
      setText("");
      setMessage("Risposta inviata e salvata nella conversazione.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-300 bg-white p-4">
      <h3 className="text-sm font-semibold text-stone-900">Rispondi tu</h3>
      <p className="mt-1 text-xs text-stone-500">
        Usa questo campo per i casi che richiedono una decisione manuale.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder="Scrivi la risposta al cliente…"
        className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-600"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-stone-400">{text.length}/4000</span>
        <button
          type="button"
          disabled={busy || !text.trim() || text.length > 4000}
          onClick={() => void send()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Invio…" : "Invia risposta"}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
    </section>
  );
}

function HandoffButton({
  threadId,
  action,
  label,
  confirmMessage,
  onDone,
}: {
  threadId: string;
  action: "take_over" | "return_to_ai" | "stop";
  label: string;
  confirmMessage?: string;
  onDone?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        onClick={async () => {
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          setBusy(true);
          setFeedback(null);
          try {
            const response = await fetch("/api/inbox/handoff", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ threadId, action }),
            });
            const payload = (await response.json()) as {
              error?: string;
              replied?: boolean;
              reason?: string;
            };
            if (!response.ok) throw new Error(payload.error ?? "Operazione non riuscita");
            setFeedback(
              action === "return_to_ai"
                ? payload.replied
                  ? "Attila è attivo e ha risposto."
                  : payload.reason === "ALREADY_REPLIED"
                    ? "Attila è attivo: l’ultimo messaggio aveva già una risposta."
                    : "Attila è attivo. Questo messaggio richiede un controllo manuale."
                : action === "take_over"
                  ? "Ora gestisci tu la conversazione."
                  : "Conversazione chiusa e automazione fermata.",
            );
            await onDone?.();
          } catch (reason) {
            setFeedback(reason instanceof Error ? reason.message : "Operazione non riuscita");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (action === "return_to_ai" ? "Attila sta rispondendo…" : "Aggiorno…") : label}
      </button>
      {feedback ? <p className="mt-2 max-w-sm text-xs font-medium text-stone-700">{feedback}</p> : null}
    </div>
  );
}

function CalendarActionButton({
  eventId,
  leadId,
  threadId,
  action,
  label,
}: {
  eventId: string;
  leadId: string;
  threadId: string;
  action: "cancel" | "reschedule";
  label: string;
}) {
  return (
    <button
      type="button"
      className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50"
      onClick={() => {
        void fetch(`/api/calendar/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "event",
            action,
            leadId,
            threadId,
            title: "Chiamata",
          }),
        }).then(() => {
          window.location.reload();
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
