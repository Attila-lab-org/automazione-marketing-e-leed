"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import TelegramConversationDrawer from "@/components/telegram-conversation-drawer";
import type { InboxConversationDetail } from "@/lib/inbound/conversation";
import type { InboxThreadItem } from "@/lib/inbound/list-inbox";

type InboxView = "all" | "manual" | "ai" | "waiting" | "appointments";

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
  if (item.commercialState === "CALL_BOOKED") return "appointments";
  if (
    item.assignedMode === "HUMAN" ||
    Boolean(item.humanRequiredReason) ||
    item.status === "NEEDS_REPLY" ||
    item.commercialState === "HUMAN_REQUIRED"
  ) {
    return "manual";
  }
  if (
    item.commercialState === "FOLLOW_UP_LATER" ||
    (item.nextStepAt && new Date(item.nextStepAt).getTime() > Date.now())
  ) {
    return "waiting";
  }
  return "ai";
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
    {
      id: "waiting",
      label: "In attesa",
      description: "Clienti da ricontattare più avanti o in attesa del prossimo passo.",
    },
    {
      id: "appointments",
      label: "Appuntamenti",
      description: "Conversazioni che hanno già una chiamata fissata.",
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
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">{item.leadName}</span>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            {item.channelLabel}
          </span>
          {item.commercialState ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
              {commercialStateLabel(item.commercialState)}
            </span>
          ) : null}
          {item.assignedMode ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
              {item.assignedMode === "HUMAN" ? "Risposta manuale" : "Attila attivo"}
            </span>
          ) : null}
          {item.humanRequiredReason ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
              Richiede te
            </span>
          ) : null}
          {item.priority === "HOT" ? (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
              HOT
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
