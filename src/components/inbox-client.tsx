"use client";

import { useEffect, useRef, useState } from "react";
import EmptyState from "@/components/empty-state";
import TelegramConversationDrawer from "@/components/telegram-conversation-drawer";
import type { InboxConversationDetail } from "@/lib/inbound/conversation";
import type { InboxThreadItem } from "@/lib/inbound/list-inbox";

type InboxView = "all" | "manual" | "ai";
type ChannelFilter = "all" | "email" | "telegram";
type ReplyFilter = "all" | "replied" | "waiting" | "no_reply";
type UrgencyFilter = "all" | "urgent" | "normal";

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
    item.latestDirection === "INBOUND" ||
    item.commercialState === "HUMAN_REQUIRED"
  ) {
    return "manual";
  }
  return "ai";
}

function primaryStatus(item: InboxThreadItem): string {
  if (item.latestDirection === "INBOUND") return "Il cliente ha risposto";
  if (item.humanRequiredReason || item.assignedMode === "HUMAN") return "Serve una tua risposta";
  if (item.commercialState === "CALL_BOOKED") return "Appuntamento fissato";
  if (item.commercialState === "FOLLOW_UP_LATER") return "In attesa";
  if (item.assignedMode === "AI") return "Attila la sta gestendo";
  if (item.needsAttention) return "Da controllare";
  return item.commercialState ? commercialStateLabel(item.commercialState) : "Conversazione aperta";
}

export default function InboxClient({
  channelScope = "all",
  initialThreads,
  initialError = null,
  archivedView = false,
}: {
  channelScope?: "all" | "telegram" | "email";
  initialThreads?: InboxThreadItem[];
  initialError?: string | null;
  archivedView?: boolean;
}) {
  const [threads, setThreads] = useState<InboxThreadItem[]>(initialThreads ?? []);
  const [loading, setLoading] = useState(initialThreads === undefined);
  const [error, setError] = useState<string | null>(initialError);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<InboxConversationDetail | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [view, setView] = useState<InboxView>("all");
  const [channel, setChannel] = useState<ChannelFilter>(
    channelScope === "telegram" ? "telegram" : channelScope === "email" ? "email" : "all",
  );
  const [reply, setReply] = useState<ReplyFilter>("all");
  const [urgency, setUrgency] = useState<UrgencyFilter>("all");
  const [query, setQuery] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const openThreadRef = useRef<string | null>(null);
  const conversationCache = useRef(new Map<string, InboxConversationDetail>());
  const conversationRequests = useRef(
    new Map<string, Promise<InboxConversationDetail>>(),
  );

  async function refreshThreads() {
    const params = new URLSearchParams();
    if (channelScope === "telegram" || channelScope === "email") {
      params.set("channel", channelScope);
    }
    if (archivedView) params.set("archived", "1");
    const response = await fetch(`/api/inbox?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Impossibile caricare i messaggi");
    const loadedThreads = (data.threads as InboxThreadItem[]) ?? [];
    setThreads(loadedThreads);
    return loadedThreads;
  }

  async function archiveThread(threadId: string, archive: boolean) {
    setActionBusy(threadId);
    try {
      const response = await fetch("/api/inbox/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          action: archive ? "archive" : "unarchive",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operazione non riuscita");
      await refreshThreads();
      if (openThreadId === threadId) {
        setOpenThreadId(null);
        setConversation(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operazione non riuscita");
    } finally {
      setActionBusy(null);
    }
  }

  function loadConversation(
    threadId: string,
    force = false,
  ): Promise<InboxConversationDetail> {
    if (!force) {
      const cached = conversationCache.current.get(threadId);
      if (cached) return Promise.resolve(cached);
      const pending = conversationRequests.current.get(threadId);
      if (pending) return pending;
    }

    const request = (async () => {
      const response = await fetch(`/api/inbox/${encodeURIComponent(threadId)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Impossibile caricare la conversazione");
      }
      const detail = data.conversation as InboxConversationDetail;
      conversationCache.current.set(threadId, detail);
      return detail;
    })();
    conversationRequests.current.set(threadId, request);
    void request.finally(() => {
      if (conversationRequests.current.get(threadId) === request) {
        conversationRequests.current.delete(threadId);
      }
    }).catch(() => undefined);
    return request;
  }

  function prefetchConversation(threadId: string) {
    void loadConversation(threadId).catch(() => undefined);
  }

  async function openConversation(threadId: string, force = false) {
    openThreadRef.current = threadId;
    setOpenThreadId(threadId);
    setConversationError(null);
    const cached = force ? null : conversationCache.current.get(threadId);
    setConversation(cached ?? null);
    setConversationLoading(!cached);
    if (cached) return;
    try {
      const detail = await loadConversation(threadId, force);
      if (openThreadRef.current === threadId) {
        setConversation(detail);
      }
    } catch (reason) {
      if (openThreadRef.current === threadId) {
        setConversationError(
          reason instanceof Error ? reason.message : "Errore conversazione",
        );
      }
    } finally {
      if (openThreadRef.current === threadId) {
        setConversationLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedThreads = initialThreads ?? (await refreshThreads());
        if (!cancelled) {
          const params = new URLSearchParams(window.location.search);
          const threadId = params.get("thread");
          const leadId = params.get("lead");
          const requestedChannel = params.get("channel");
          if (channelScope === "all" && (requestedChannel === "email" || requestedChannel === "telegram")) {
            setChannel(requestedChannel);
          }
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
    // Bootstrap iniziale soltanto: i refresh successivi sono espliciti dopo le mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <p className="text-sm text-stone-500">Caricamento conversazioni…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const scopedThreads =
    channelScope === "telegram"
      ? threads.filter((thread) => thread.channel === "telegram")
      : channelScope === "email"
        ? threads.filter((thread) => thread.channel === "email")
        : threads;

  if (scopedThreads.length === 0) {
    return (
      <EmptyState
        title={archivedView ? "Nessuna chat archiviata" : "Nessuna conversazione"}
        description={
          channelScope === "telegram"
            ? archivedView
              ? "Quando archivi una chat Telegram, la trovi qui."
              : "Le chat del bot compariranno qui al primo messaggio utile."
            : channelScope === "email"
              ? "Qui vedrai solo le risposte email dei clienti."
              : "Qui vedrai le conversazioni da gestire."
        }
        nextAction={{
          label: channelScope === "telegram" ? "Configura Telegram" : "Controlla i collegamenti",
          href: channelScope === "telegram" ? "/telegram#telegram-config" : "/settings",
        }}
      />
    );
  }

  const views: Array<{ id: InboxView; label: string; description: string }> = [
    {
      id: "all",
      label: archivedView ? "Archiviate" : "Aperte",
      description:
        channelScope === "telegram"
          ? archivedView
            ? "Chat Telegram chiuse."
            : "Solo chat Telegram ancora aperte."
          : channelScope === "email"
            ? "Solo conversazioni email."
            : "Conversazioni da gestire.",
    },
    {
      id: "manual",
      label: "Da rispondere",
      description: "Richiedono una tua decisione.",
    },
    {
      id: "ai",
      label: "Gestite da Attila",
      description: "Conversazioni che Attila sta portando avanti.",
    },
  ];
  const counts = Object.fromEntries(
    views.map((candidate) => [
      candidate.id,
      candidate.id === "all"
        ? scopedThreads.length
        : scopedThreads.filter((thread) => inboxViewFor(thread) === candidate.id).length,
    ]),
  ) as Record<InboxView, number>;
  const visible = scopedThreads.filter((thread) => {
    const search = query.trim().toLocaleLowerCase("it-IT");
    if (view !== "all" && inboxViewFor(thread) !== view) return false;
    if (channel !== "all" && thread.channel !== channel) return false;
    if (reply === "replied" && !thread.hasInboundReply) return false;
    if (reply === "waiting" && thread.latestDirection !== "INBOUND") return false;
    if (reply === "no_reply" && thread.hasInboundReply) return false;
    const isUrgent =
      thread.priority === "HOT" ||
      thread.priority === "HIGH" ||
      thread.needsAttention ||
      Boolean(thread.humanRequiredReason);
    if (urgency === "urgent" && !isUrgent) return false;
    if (urgency === "normal" && isUrgent) return false;
    if (
      search &&
      !`${thread.leadName} ${thread.campaignName ?? ""} ${thread.subject ?? ""} ${thread.preview ?? ""}`
        .toLocaleLowerCase("it-IT")
        .includes(search)
    ) {
      return false;
    }
    return true;
  });
  const activeView = views.find((candidate) => candidate.id === view)!;
  const activeFilterCount =
    Number(channel !== "all") +
    Number(reply !== "all") +
    Number(urgency !== "all") +
    Number(Boolean(query.trim()));

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
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-stone-600">
              Cerca cliente, campagna o testo
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Es. Rossi, campagna Milano…"
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-amber-500"
              />
            </label>
            {channelScope === "all" ? (
              <FilterSelect
                label="Canale"
                value={channel}
                onChange={(value) => setChannel(value as ChannelFilter)}
                options={[
                  ["all", "Tutti"],
                  ["email", "Solo email"],
                  ["telegram", "Solo Telegram"],
                ]}
              />
            ) : null}
            <FilterSelect
              label="Risposta"
              value={reply}
              onChange={(value) => setReply(value as ReplyFilter)}
              options={[
                ["all", "Tutte"],
                ["waiting", "Ha risposto: da gestire"],
                ["replied", "Ha risposto almeno una volta"],
                ["no_reply", "Non ha ancora risposto"],
              ]}
            />
            <FilterSelect
              label="Urgenza"
              value={urgency}
              onChange={(value) => setUrgency(value as UrgencyFilter)}
              options={[
                ["all", "Tutte"],
                ["urgent", "Urgenti"],
                ["normal", "Non urgenti"],
              ]}
            />
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setChannel("all");
                  setReply("all");
                  setUrgency("all");
                }}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Azzera
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">{activeView.label}</h2>
            <p className="text-sm text-stone-500">{activeView.description}</p>
          </div>
          <p className="shrink-0 text-sm font-medium text-stone-500">
            {visible.length} {visible.length === 1 ? "conversazione" : "conversazioni"}
          </p>
        </div>
        {visible.length ? (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {visible.map((thread) => (
              <InboxRow
                key={thread.threadId}
                item={thread}
                archivedView={archivedView}
                actionBusy={actionBusy === thread.threadId}
                onPrefetch={() => prefetchConversation(thread.threadId)}
                onOpen={() => void openConversation(thread.threadId)}
                onArchive={() => void archiveThread(thread.threadId, !archivedView)}
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
            openThreadRef.current = null;
            setOpenThreadId(null);
            setConversation(null);
          }}
          onChanged={async () => {
            conversationCache.current.delete(openThreadId);
            await Promise.all([refreshThreads(), openConversation(openThreadId, true)]);
          }}
        />
      ) : null}
    </div>
  );
}

function InboxRow({
  item,
  archivedView,
  actionBusy,
  onPrefetch,
  onOpen,
  onArchive,
}: {
  item: InboxThreadItem;
  archivedView: boolean;
  actionBusy: boolean;
  onPrefetch: () => void;
  onOpen: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex items-stretch gap-2 p-2">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg px-3 py-3 text-left hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-stone-900">{item.leadName}</span>
            {item.channel === "telegram" ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                Telegram
              </span>
            ) : item.channel === "email" ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                Email
              </span>
            ) : null}
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
            <p className="text-xs font-medium text-stone-500">Invio email: {item.campaignName}</p>
          ) : null}
          <p className="line-clamp-2 text-sm text-stone-600">
            {item.preview ?? item.subject ?? "Nessun messaggio"}
          </p>
        </div>
        <div className="shrink-0 text-xs text-stone-500 sm:text-right">
          <p>{formatWhen(item.lastMessageAt)}</p>
          <p className="mt-1 font-semibold text-stone-800">Apri →</p>
        </div>
      </button>
      <button
        type="button"
        disabled={actionBusy}
        onClick={() => {
          if (
            !archivedView &&
            !window.confirm(`Archiviare la conversazione con ${item.leadName}?`)
          ) {
            return;
          }
          onArchive();
        }}
        className="self-center rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
      >
        {actionBusy ? "…" : archivedView ? "Riapri" : "Archivia"}
      </button>
    </li>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-stone-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900 lg:w-auto"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
