"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { hrefForAction, type OperatorAction } from "@/lib/ai/operator/actions";
import { envelopeFromPath } from "@/lib/ai/operator/envelope";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: OperatorAction[];
};

type ToolStatus = { id: string; label: string; done: boolean; ok: boolean };
type DrawerGoal = {
  id: string;
  title: string;
  mode: "ASK" | "DO" | "AUTOPILOT";
  status: string;
  current_value: number;
  target_value: number;
  progress_snapshot?: { pace?: string };
};

const SUGGESTIONS = [
  "Cosa mi consigli oggi?",
  "Questo mese voglio 10 clienti per siti web",
  "Ricordati che preferisco risposte brevi e dirette",
  "Imposta modalità autonoma",
  "Quanti appuntamenti ho?",
  "Aggiungi disponibilità domani alle 15:00",
];

function parseSseChunk(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const line = part
      .split("\n")
      .filter((row) => row.startsWith("data: "))
      .map((row) => row.slice(6))
      .join("");
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* ignore incomplete */
    }
  }
  return { events, rest };
}

type StreamHandlers = {
  onSession: (sessionId: string) => void;
  onToolStart: (name: string, label: string) => void;
  onToolDone: (ok: boolean, label: string) => void;
  onAssistant: (id: string, content: string, actions: OperatorAction[]) => void;
};

async function streamOperatorChat(
  payload: { message: string; sessionId: string | null; envelope: unknown },
  assistantId: string,
  handlers: StreamHandlers,
): Promise<{ text: string; actions: OperatorAction[] }> {
  const response = await fetch("/api/ai/operator/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error ?? "Domanda non inviata");
  }
  if (!response.body) throw new Error("Risposta vuota");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { text: "", actions: [] as OperatorAction[] };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.rest;
    for (const raw of parsed.events) {
      const event = raw as {
        type?: string;
        sessionId?: string;
        name?: string;
        label?: string;
        ok?: boolean;
        text?: string;
        reply?: string;
        actions?: OperatorAction[];
        message?: string;
      };
      if (event.type === "session" && event.sessionId) handlers.onSession(event.sessionId);
      if (event.type === "tool_start" && event.name && event.label) {
        handlers.onToolStart(event.name, event.label);
      }
      if (event.type === "tool_done" && event.label) {
        handlers.onToolDone(Boolean(event.ok), event.label);
      }
      if (event.type === "delta" && event.text) {
        state.text += event.text;
        handlers.onAssistant(assistantId, state.text, state.actions);
      }
      if (event.type === "done") {
        state.text = event.reply ?? state.text;
        state.actions = event.actions ?? [];
        handlers.onAssistant(assistantId, state.text, state.actions);
      }
      if (event.type === "error") {
        throw new Error(event.message ?? "Errore Attila AI");
      }
    }
    if (done) break;
  }
  return state;
}

export default function AttilaAiDrawer() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("attila-operator-session"),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modeLabel, setModeLabel] = useState("ASSISTITO");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dailyBriefing, setDailyBriefing] = useState<string | null>(null);
  const [goalSummary, setGoalSummary] = useState<string | null>(null);
  const [goal, setGoal] = useState<DrawerGoal | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const briefingLoadedRef = useRef(false);

  const [seq, setSeq] = useState(0);

  const envelope = useMemo(
    () => envelopeFromPath(pathname, searchParams.toString()),
    [pathname, searchParams],
  );

  useEffect(() => {
    void fetch("/api/ai/status")
      .then((r) => r.json())
      .then((data) => {
        if (data?.readiness?.detail?.includes("OpenAI")) setModeLabel("ASSISTITO");
      })
      .catch(() => undefined);
    void fetch("/api/settings/playbook")
      .then((r) => r.json())
      .then((data) => {
        if (data?.playbook?.autonomy?.defaultMode === "AUTO_ALLOWED") {
          setModeLabel("AUTO CONTROLLATO");
        }
      })
      .catch(() => undefined);
    try {
      const saved = window.localStorage.getItem("attila-operator-session");
      if (saved) {
        void fetch(`/api/ai/operator/sessions?sessionId=${encodeURIComponent(saved)}`)
          .then((r) => r.json())
          .then((data) => {
            if (!Array.isArray(data?.messages) || !data.messages.length) return;
            setMessages(
              data.messages.map(
                (m: { id: string; role: "user" | "assistant"; content: string; actions?: OperatorAction[] }) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  actions: m.actions,
                }),
              ),
            );
          })
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    try {
      window.localStorage.setItem("attila-operator-session", sessionId);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, tools, busy]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || messages.length > 0 || briefingLoadedRef.current) return;
    briefingLoadedRef.current = true;
    void fetch("/api/ai/insights")
      .then((response) => response.json())
      .then((data) => {
        const briefing = data?.briefing;
        const goal = data?.goal;
        if (goal?.id) {
          setModeLabel(goal.mode ?? "DO");
          const progress = goal.progress_snapshot ?? {};
          setGoalSummary(
            `${goal.title} · ${goal.current_value}/${goal.target_value} · ${progress.pace ?? "IN OSSERVAZIONE"}`,
          );
        }
        if (!briefing?.summary) return;
        const actions = Array.isArray(briefing.actions)
          ? briefing.actions.slice(0, 3)
          : [];
        setDailyBriefing(
          `${briefing.summary}${actions.length ? `\n\nOggi partirei così:\n${actions.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n")}` : ""}`,
        );
      })
      .catch(() => undefined);
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/ai/goals", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const goal = data?.goal;
        if (!goal?.id) return;
        setGoal(goal);
        const progress = goal.progress_snapshot ?? {};
        setModeLabel(goal.mode ?? "DO");
        setGoalSummary(
          `${goal.title} · ${goal.current_value}/${goal.target_value} · ${progress.pace ?? "IN OSSERVAZIONE"}`,
        );
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const next = seq + 1;
    setSeq(next);
    const userId = `u-${next}`;
    const assistantId = `a-${next}`;
    setBusy(true);
    setError(null);
    setDraft("");
    setTools([]);
    setMessages((current) => [...current, { id: userId, role: "user", content: message }]);

    try {
      const result = await streamOperatorChat(
        { message, sessionId, envelope },
        assistantId,
        {
          onSession: setSessionId,
          onToolStart: (name, label) => {
            setTools((current) => [
              ...current,
              { id: `${name}-${current.length}`, label, done: false, ok: false },
            ]);
          },
          onToolDone: (ok, label) => {
            setTools((current) => {
              const nextTools = current.map((item) => ({ ...item }));
              for (let i = nextTools.length - 1; i >= 0; i -= 1) {
                if (!nextTools[i]?.done) {
                  nextTools[i] = {
                    ...nextTools[i]!,
                    done: true,
                    ok,
                    label: ok ? `✓ ${label}` : label,
                  };
                  break;
                }
              }
              return nextTools;
            });
          },
          onAssistant: (id, content, actions) => {
            setMessages((current) => {
              const without = current.filter((item) => item.id !== id);
              return [...without, { id, role: "assistant", content, actions }];
            });
          },
        },
      );
      const shouldOpenPage =
        /^(apri|vai|portami|mostrami la pagina)\b/i.test(message) &&
        result.actions.length === 1 &&
        result.actions[0]?.type === "open_page";
      if (shouldOpenPage && result.actions[0]) {
        router.push(hrefForAction(result.actions[0]));
        setOpen(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore Attila AI");
    } finally {
      void fetch("/api/ai/goals", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          const refreshed = data?.goal as DrawerGoal | undefined;
          if (!refreshed?.id) return;
          setGoal(refreshed);
          setModeLabel(refreshed.mode);
          setGoalSummary(
            `${refreshed.title} · ${refreshed.current_value}/${refreshed.target_value} · ${refreshed.progress_snapshot?.pace ?? "IN OSSERVAZIONE"}`,
          );
        })
        .catch(() => undefined);
      setBusy(false);
    }
  }

  async function changeGoalMode(mode: DrawerGoal["mode"]) {
    if (!goal || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: goal.id, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Modalità non aggiornata");
      setGoal(data.goal);
      setModeLabel(data.goal.mode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Modalità non aggiornata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="attila-ai-panel"
        className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-amber-950 shadow-lg hover:bg-amber-100 md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
      >
        Attila AI
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <button
            type="button"
            aria-label="Chiudi Attila AI"
            className="absolute inset-0 bg-stone-900/30"
            onClick={() => setOpen(false)}
          />
          <aside
            id="attila-ai-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attila-ai-title"
            className="relative flex h-[min(78vh,760px)] w-full max-w-5xl flex-col rounded-t-2xl border border-b-0 border-stone-200 bg-white shadow-2xl"
          >
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-stone-300" aria-hidden />
            <header className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
              <div>
                <h2 id="attila-ai-title" className="text-sm font-semibold text-stone-900">
                  Attila · il tuo agente commerciale
                </h2>
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  {modeLabel}
                </p>
                {goalSummary ? (
                  <p className="max-w-[280px] truncate text-xs font-medium text-stone-700">
                    {goalSummary}
                  </p>
                ) : null}
                <p className="text-xs text-stone-500">
                  {pathname.startsWith("/campaigns")
                    ? "Contesto: invii email"
                    : pathname.startsWith("/leads")
                      ? "Contesto: attività"
                      : pathname.startsWith("/inbox") || pathname.startsWith("/telegram")
                        ? "Contesto: messaggi"
                        : pathname.startsWith("/calendar")
                          ? "Contesto: calendario"
                          : pathname.startsWith("/review")
                            ? "Contesto: review"
                            : "Gestisci contatti, invii, messaggi e calendario. Invii e stop restano confermati."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
              >
                Chiudi
              </button>
            </header>

            <div className="border-b border-stone-100 bg-stone-50 px-4 py-2.5">
              {goal ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-1">
                    {(["ASK", "DO", "AUTOPILOT"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={busy || goal.mode === mode}
                        onClick={() => void changeGoalMode(mode)}
                        className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                          goal.mode === mode
                            ? "bg-amber-200 text-amber-950"
                            : "border border-stone-200 bg-white text-stone-600"
                        } disabled:opacity-60`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <Link
                    href="/overview"
                    onClick={() => setOpen(false)}
                    className="text-xs font-semibold text-amber-800"
                  >
                    Gestisci goal
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-stone-600">Nessun obiettivo attivo.</p>
                  <Link
                    href="/overview"
                    onClick={() => setOpen(false)}
                    className="text-xs font-semibold text-amber-800"
                  >
                    Configura
                  </Link>
                </div>
              )}
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  {dailyBriefing ? (
                    <div className="mr-4 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-800">
                      {dailyBriefing}
                    </div>
                  ) : null}
                  <p className="text-sm text-stone-600">
                    Posso gestire appuntamenti, Telegram, invii email e contatti. Se mi dici
                    “ricordati che…”, conserverò quella preferenza. Invii e azioni irreversibili
                    restano da confermare.
                  </p>
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => void send(item)}
                      className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-amber-100 px-4 py-3 text-sm text-stone-900"
                      : "mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 shadow-sm"
                  }
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    {message.role === "user" ? "Tu" : "Attila"}
                  </p>
                  <div className="whitespace-pre-wrap leading-6">{message.content}</div>
                  {message.actions && message.actions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.actions.map((action) =>
                        action.type === "confirm_action" || action.type === "cancel_action" ? (
                          <button
                            key={`${action.type}-${action.pendingActionId}`}
                            type="button"
                            disabled={confirmingId === action.pendingActionId || busy}
                            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                            onClick={() => {
                              if (confirmingId) return;
                              setConfirmingId(action.pendingActionId);
                              void fetch("/api/ai/operator/confirm", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  pendingActionId: action.pendingActionId,
                                  accept: action.type === "confirm_action",
                                }),
                              })
                                .then(async (response) => {
                                  const data = (await response.json()) as {
                                    summary?: string;
                                    error?: string;
                                  };
                                  setMessages((current) => [
                                    ...current.map((row) =>
                                      row.id === message.id ? { ...row, actions: undefined } : row,
                                    ),
                                    {
                                      id: `sys-${Date.now()}`,
                                      role: "assistant",
                                      content: data.summary ?? data.error ?? "Azione aggiornata",
                                    },
                                  ]);
                                })
                                .finally(() => setConfirmingId(null));
                            }}
                          >
                            {confirmingId === action.pendingActionId ? "Attendi…" : action.label}
                          </button>
                        ) : action.type === "send_followup" ? (
                          <button
                            key={`${action.type}-${action.label}`}
                            type="button"
                            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                            onClick={() => void send(action.message)}
                          >
                            {action.label}
                          </button>
                        ) : (
                          <Link
                            key={`${action.type}-${hrefForAction(action)}`}
                            href={hrefForAction(action)}
                            onClick={() => setOpen(false)}
                            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                          >
                            {action.label}
                          </Link>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              ))}

              {tools.length > 0 ? (
                <ul className="mr-auto max-w-[92%] space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-stone-700">
                  {tools.map((tool) => (
                    <li key={tool.id} className="flex items-start gap-2">
                      <span className={tool.done && tool.ok ? "text-emerald-600" : "text-amber-700"}>
                        {tool.done ? (tool.ok ? "✓" : "!") : "•"}
                      </span>
                      <span>{tool.label.replace(/^✓\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <form
              className="border-t border-stone-100 bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
              <textarea
                ref={inputRef}
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Scrivi cosa vuoi ottenere. Attila organizza i passaggi…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Attila sta lavorando…" : "Chiedi ad Attila"}
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
