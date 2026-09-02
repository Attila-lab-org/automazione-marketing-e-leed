"use client";

import { useState } from "react";
import Link from "next/link";

export default function UnsubscribeClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function unsubscribe() {
    setStatus("busy");
    try {
      const response = await fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Operazione non riuscita.");
      setMessage(data.message ?? "Richiesta registrata.");
      setStatus("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita.");
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Atti-Lab</p>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">Non vuoi ricevere altre email?</h1>
        {status === "done" ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Confermando, il tuo indirizzo viene inserito nella lista di esclusione permanente e
              gli invii già programmati vengono fermati.
            </p>
            <button
              type="button"
              disabled={status === "busy" || !token}
              onClick={() => void unsubscribe()}
              className="mt-5 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {status === "busy" ? "Registro la richiesta…" : "Non inviarmi più email"}
            </button>
          </>
        )}
        {status === "error" ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
        <p className="mt-5 text-xs text-stone-500">
          Per sapere come trattiamo i dati consulta la{" "}
          <Link href="/privacy" className="underline">
            pagina privacy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
