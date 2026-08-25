"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import TelegramConversationDrawer from "@/components/telegram-conversation-drawer";
import type { InboxConversationDetail } from "@/lib/inbound/conversation";
import type { InboxThreadItem } from "@/lib/inbound/list-inbox";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  if (status === "NEEDS_REPLY") return "Da gestire";
  if (status === "OPEN") return "Aperta";
  if (status === "ARCHIVED") return "Archiviata";
  return status;
}

export default function InboxClient() {
  const [threads, setThreads] = useState<InboxThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<InboxConversationDetail | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  async function openConversation(threadId: string) {
    setOpenThreadId(threadId);
    setConversation(null);
    setConversationError(null);
    setConversationLoading(true);
    try {
      const response = await fetch(`/api/inbox/${encodeURIComponent(threadId)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Impossibile caricare la conversazione");
      }
      setConversation(data.conversation as InboxConversationDetail);
    } catch (reason) {
      setConversationError(
        reason instanceof Error ? reason.message : "Errore conversazione",
      );
    } finally {
      setConversationLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Impossibile caricare i messaggi");
        if (!cancelled) {
          const loadedThreads = (data.threads as InboxThreadItem[]) ?? [];
          setThreads(loadedThreads);
          const leadId = new URLSearchParams(window.location.search).get("lead");
          const requested = leadId
            ? loadedThreads.find((thread) => thread.leadId === leadId)
            : null;
          if (requested) void openConversation(requested.threadId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Errore caricamento");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-stone-500">Caricamento conversazioni…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        title="Nessuna conversazione"
        description="Qui vedrai le risposte email e i contatti nati da Telegram (e in futuro altri canali). Quando arriva un messaggio rilevante, compare in questa lista."
        nextAction={{
          label: "Controlla i collegamenti",
          href: "/settings",
        }}
      />
    );
  }

  const social = threads.filter((t) => t.channel === "telegram");
  const other = threads.filter((t) => t.channel !== "telegram");

  return (
    <div className="space-y-8">
      {social.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">
              Contatti da Telegram
            </h2>
            <p className="text-xs text-stone-500">
              Richieste intercettate dal bot. Controllale e prosegui tu la conversazione.
            </p>
          </div>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {social.map((t) => (
              <InboxRow
                key={t.threadId}
                item={t}
                onOpen={() => void openConversation(t.threadId)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {other.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Altre conversazioni</h2>
            <p className="text-xs text-stone-500">
              Thread email e messaggi collegati alle campagne.
            </p>
          </div>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {other.map((t) => (
              <InboxRow
                key={t.threadId}
                item={t}
                onOpen={() => void openConversation(t.threadId)}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {openThreadId ? (
        <TelegramConversationDrawer
          detail={conversation}
          loading={conversationLoading}
          error={conversationError}
          onClose={() => {
            setOpenThreadId(null);
            setConversation(null);
          }}
        />
      ) : null}
    </div>
  );
}

function InboxRow({
  item,
  onOpen,
}: {
  item: InboxThreadItem;
  onOpen: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">{item.leadName}</span>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            {item.channelLabel}
          </span>
          {item.commercialState ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
              {item.commercialState}
            </span>
          ) : null}
          {item.assignedMode ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
              {item.assignedMode === "HUMAN" ? "HUMAN" : "AI"}
            </span>
          ) : null}
          {item.humanRequiredReason ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
              HUMAN REQUIRED
            </span>
          ) : null}
          {item.needsAttention ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              Da gestire
            </span>
          ) : (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
              {statusLabel(item.status)}
            </span>
          )}
        </div>
        {item.contactHandle ? (
          <p className="text-xs text-stone-500">{item.contactHandle}</p>
        ) : null}
        {item.nextStep ? (
          <p className="text-xs text-stone-500">Prossimo passo: {item.nextStep}</p>
        ) : null}
        {item.preview ? (
          <p className="line-clamp-2 text-sm text-stone-600">{item.preview}</p>
        ) : (
          <p className="text-sm text-stone-400">{item.subject ?? "Nessun anteprima"}</p>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-stone-500">
        <p>{formatWhen(item.lastMessageAt)}</p>
        <button
          type="button"
          onClick={onOpen}
          title="Apri contatto, gruppo, stato risposta e cronologia completa"
          className="mt-1 inline-block font-medium text-stone-800 underline-offset-2 hover:underline"
        >
          Apri conversazione →
        </button>
      </div>
    </li>
  );
}
