"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import TelegramConversationDrawer from "@/components/telegram-conversation-drawer";
import type { InboxConversationDetail } from "@/lib/inbound/conversation";
import type { InboxThreadItem } from "@/lib/inbound/list-inbox";

type InboxView = "all" | "manual" | "ai";

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

function commercialStateLabel(state: string): string {
  const labels: Record<string, string> = {
    NEW: "Nuovo",
    ENGAGED: "Conversazione avviata",
    QUALIFYING: "Qualificazione",
    INTERESTED: "Interessato",
    PRICING: "Prezzo",
    CALL_PROPOSED: "Chiamata proposta",
    CALL_BOOKED: "Appuntamento fissato",
    FOLLOW_UP_LATER: "Da ricontattare",
    HUMAN_REQUIRED: "Serve intervento",
    NOT_INTERESTED: "Non interessato",
    UNSUBSCRIBED: "Non contattare",
  };
  return labels[state] ?? state;
}

function inboxViewFor(item: InboxThreadItem): InboxView {
  if (
    item.assignedMode === "HUMAN" ||
    Boolean(item.humanRequiredReason) ||
    item.status === "NEEDS_REPLY" ||
    item.commercialState === "HUMAN_REQUIRED"
  ) {
    return "manual";
  }
  return "ai";
}

function primaryStatus(item: InboxThreadItem): string {
  if (item.humanRequiredReason || item.assignedMode === "HUMAN") return "Serve una tua risposta";
  if (item.commercialState === "CALL_BOOKED") return "Appuntamento fissato";
  if (item.commercialState === "FOLLOW_UP_LATER") return "In attesa";
  if (item.assignedMode === "AI") return "Attila la sta gestendo";
  if (item.needsAttention) return "Da controllare";
  return item.commercialState ? commercialStateLabel(item.commercialState) : "Conversazione aperta";
}

export default function InboxClient() {
  const [threads, setThreads] = useState<InboxThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<InboxConversationDetail | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [view, setView] = useState<InboxView>("all");

  async function refreshThreads() {
    const response = await fetch("/api/inbox", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Impossibile caricare i messaggi");
    const loadedThreads = (data.threads as InboxThreadItem[]) ?? [];
    setThreads(loadedThreads);
    return loadedThreads;
  }

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
        const loadedThreads = await refreshThreads();
        if (!cancelled) {
          const params = new URLSearchParams(window.location.search);
          const threadId = params.get("thread");
          const leadId = params.get("lead");
          if (threadId) {
            void openConversation(threadId);
          } else if (leadId) {
            const requested = loadedThreads.find((thread) => thread.leadId === leadId);
            if (requested) void openConversation(requested.threadId);
          }
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

  const views: Array<{ id: InboxView; label: string; description: string }> = [
    {
      id: "all",
      label: "Tutte",
      description: "Tutte le conversazioni email e Telegram, incluse quelle già gestite.",
    },
    {
      id: "manual",
      label: "Da rispondere",
      description: "Richiedono una tua decisione o il takeover manuale.",
    },
    {
      id: "ai",
      label: "Gestiti dall’AI",
      description: "Conversazioni sicure che Attila sta portando avanti.",
    },
  ];
  const counts = Object.fromEntries(
    views.map((candidate) => [
      candidate.id,
      candidate.id === "all"
        ? threads.length
        : threads.filter((thread) => inboxViewFor(thread) === candidate.id).length,
    ]),
  ) as Record<InboxView, number>;
  const visible =
    view === "all" ? threads : threads.filter((thread) => inboxViewFor(thread) === view);
  const activeView = views.find((candidate) => candidate.id === view)!;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        {views.map((candidate) => {
          const active = candidate.id === view;
          const count = counts[candidate.id];
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setView(candidate.id)}
              className={
                active
                  ? "rounded-xl border border-stone-900 bg-stone-900 p-4 text-left text-white"
                  : "rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-400"
              }
            >
              <span className={active ? "text-2xl font-semibold" : "text-2xl font-semibold text-stone-900"}>
                {count}
              </span>
              <span className={active ? "mt-1 block text-sm font-semibold" : "mt-1 block text-sm font-semibold text-stone-800"}>
                {candidate.label}
              </span>
            </button>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{activeView.label}</h2>
          <p className="text-sm text-stone-500">{activeView.description}</p>
        </div>
        {visible.length ? (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {visible.map((thread) => (
              <InboxRow
                key={thread.threadId}
                item={thread}
                onOpen={() => void openConversation(thread.threadId)}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
            Nessuna conversazione in questa sezione.
          </div>
        )}
      </section>
      {openThreadId ? (
        <TelegramConversationDrawer
          detail={conversation}
          loading={conversationLoading}
          error={conversationError}
          onClose={() => {
            setOpenThreadId(null);
            setConversation(null);
          }}
          onChanged={async () => {
            await Promise.all([refreshThreads(), openConversation(openThreadId)]);
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
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-stone-900">{item.leadName}</span>
            <span
              className={
                item.channel === "telegram"
                  ? "rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                  : "rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
              }
            >
              {item.channel === "telegram" ? "Telegram" : "Email"}
            </span>
            <span
              className={
                item.humanRequiredReason || item.assignedMode === "HUMAN"
                  ? "rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800"
                  : "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
              }
            >
              {primaryStatus(item)}
            </span>
          </div>
          {item.campaignName ? (
            <p className="text-xs font-medium text-stone-500">Campagna: {item.campaignName}</p>
          ) : null}
          <p className="line-clamp-2 text-sm text-stone-600">
            {item.preview ?? item.subject ?? "Nessun messaggio"}
          </p>
        </div>
        <div className="shrink-0 text-xs text-stone-500 sm:text-right">
          <p>{formatWhen(item.lastMessageAt)}</p>
          <p className="mt-1 font-semibold text-stone-800">Vedi tutto →</p>
        </div>
      </button>
    </li>
  );
}
