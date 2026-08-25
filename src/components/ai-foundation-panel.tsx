"use client";

import { useEffect, useState } from "react";

type Readiness = {
  mode: "mock" | "openai";
  modeValid: boolean;
  apiKeyConfigured: boolean;
  routerEnabled: boolean;
  models: { luna: string; terra: string; sol: string };
  budgetsUsd: { normalLead: number; hotLead: number; thread: number };
  timeoutMs: number;
  ready: boolean;
  detail: string;
  persistenceReady: boolean;
  lastRuns: Array<{
    id: string;
    model: string;
    taskType: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    latencyMs: number;
    status: string;
    createdAt: string;
  }>;
};

type TestResponse = {
  error?: string;
  output?: {
    intent: string;
    language: string;
    sentiment: string;
    buyerOrSeller: string;
    confidence: number;
    summary: string;
    reasons: string[];
  } | null;
  run?: Readiness["lastRuns"][number] | null;
  persisted?: boolean;
  route?: { tier: string; model: string; reason: string };
};

const DEFAULT_TEXT =
  "Cerco qualcuno per realizzare un sito web per il mio ristorante a Milano";

function statusLabel(status: string): string {
  if (status === "ok") return "Completata";
  if (status === "timeout") return "Tempo scaduto";
  if (status === "invalid_output") return "Risposta non valida";
  return "Errore";
}

export default function AiFoundationPanel() {
  const [data, setData] = useState<Readiness | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<TestResponse["output"]>(null);

  async function loadStatus() {
    const response = await fetch("/api/ai/status", { cache: "no-store" });
    const payload = (await response.json()) as Readiness & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Stato AI non disponibile");
    }
    setData(payload);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStatus();
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Errore AI");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runTest() {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as TestResponse;
      if (!response.ok && !payload.run) {
        throw new Error(payload.error ?? "Prova AI non riuscita");
      }
      setLastOutput(payload.output ?? null);
      if (payload.output) {
        setFeedback(
          payload.persisted
            ? "Classificazione completata e salvata."
            : "Classificazione completata, ma il salvataggio non è riuscito.",
        );
      } else {
        setError(
          payload.run
            ? `${statusLabel(payload.run.status)}. Riprova oppure controlla la configurazione.`
            : (payload.error ?? "Prova AI non riuscita"),
        );
      }
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore AI");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <p className="text-sm text-stone-500">Verifica AI…</p>;
  }

  return (
    <section
      aria-label="AI commerciale"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-stone-800">AI commerciale</h2>
        <p className="mt-1 text-sm text-stone-500">
          Collegamento interno per classificare testi. Non invia email e non
          scrive ai clienti.
        </p>
      </div>

      {data ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-stone-500">Modalità</dt>
            <dd className="font-medium text-stone-800">
              {data.mode === "mock" ? "Prova" : "OpenAI"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Chiave</dt>
            <dd className="font-medium text-stone-800">
              {data.apiKeyConfigured ? "Presente" : "Non configurata"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Modelli</dt>
            <dd className="text-stone-700">
              Luna {data.models.luna} · Terra {data.models.terra} · Sol{" "}
              {data.models.sol}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Stato</dt>
            <dd className="font-medium text-stone-800">{data.detail}</dd>
          </div>
        </dl>
      ) : null}

      <label className="block space-y-1 text-sm text-stone-700">
        <span className="font-medium">Testo di prova</span>
        <textarea
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !data?.ready}
          onClick={() => void runTest()}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? "Classificazione…" : "Prova classificazione"}
        </button>
        {feedback ? <p className="text-sm text-emerald-700">{feedback}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {lastOutput ? (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
          <p>
            <span className="font-medium">Intento:</span> {lastOutput.intent}{" "}
            ({Math.round(lastOutput.confidence * 100)}%)
          </p>
          <p className="mt-1">{lastOutput.summary}</p>
        </div>
      ) : null}

      {data && data.lastRuns.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Ultime prove
          </h3>
          <ul className="space-y-1 text-xs text-stone-600">
            {data.lastRuns.map((run) => (
              <li key={run.id}>
                {statusLabel(run.status)} · {run.model} · {run.inputTokens + run.outputTokens} token · ~
                {run.estimatedCostUsd.toFixed(6)} USD · {run.latencyMs} ms
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
