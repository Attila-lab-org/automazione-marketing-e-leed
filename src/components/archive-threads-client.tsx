"use client";

import { useState } from "react";
import type { InboxThreadItem } from "@/lib/inbound/list-inbox";

function formatWhen(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ArchivedThreadSection({
  title,
  description,
  emptyMessage,
  threads,
  busyId,
  onRestore,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  threads: InboxThreadItem[];
  busyId: string | null;
  onRestore: (thread: InboxThreadItem) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <p className="text-sm text-stone-500">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
          {threads.length}
        </span>
      </div>

      {threads.length ? (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {threads.map((thread) => (
            <li
              key={thread.threadId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-900">
                  {thread.leadName}
                </p>
                <p className="mt-0.5 truncate text-sm text-stone-600">
                  {thread.subject ?? thread.preview ?? "Conversazione archiviata"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {thread.campaignName ? `${thread.campaignName} · ` : ""}
                  {formatWhen(thread.lastMessageAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === thread.threadId}
                onClick={() => onRestore(thread)}
                className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                {busyId === thread.threadId ? "Ripristino…" : "Ripristina"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default function ArchiveThreadsClient({
  telegramThreads: initialTelegramThreads,
  emailThreads: initialEmailThreads,
}: {
  telegramThreads: InboxThreadItem[];
  emailThreads: InboxThreadItem[];
}) {
  const [telegramThreads, setTelegramThreads] = useState(initialTelegramThreads);
  const [emailThreads, setEmailThreads] = useState(initialEmailThreads);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(thread: InboxThreadItem) {
    setBusyId(thread.threadId);
    setError(null);
    try {
      const response = await fetch("/api/inbox/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.threadId, action: "unarchive" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ripristino fallito");
      if (thread.channel === "telegram") {
        setTelegramThreads((current) =>
          current.filter((item) => item.threadId !== thread.threadId),
        );
      } else {
        setEmailThreads((current) =>
          current.filter((item) => item.threadId !== thread.threadId),
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ripristino fallito");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ArchivedThreadSection
        title="Chat Telegram archiviate"
        description="Le chat ripristinate tornano subito in Telegram."
        emptyMessage="Nessuna chat Telegram archiviata."
        threads={telegramThreads}
        busyId={busyId}
        onRestore={(thread) => void restore(thread)}
      />

      <ArchivedThreadSection
        title="Email archiviate"
        description="Le conversazioni ripristinate tornano subito in Posta."
        emptyMessage="Nessuna conversazione email archiviata."
        threads={emailThreads}
        busyId={busyId}
        onRestore={(thread) => void restore(thread)}
      />
    </>
  );
}
