"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/overview";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Accesso negato");
      router.replace(next.startsWith("/") ? next : "/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accesso negato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-stone-900">Gestione contatti</h1>
        <p className="mt-1 text-sm text-stone-500">Accesso riservato</p>

        <label className="mt-6 block text-sm font-medium text-stone-700">
          Indirizzo email
          <input
            type="email"
            required
            autoComplete="username"
            title="Inserisci l’indirizzo email autorizzato ad accedere."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-stone-700">
          Parola d’ordine
          <input
            type="password"
            required
            autoComplete="current-password"
            title="Inserisci la parola d’ordine del tuo account."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          title="Accedi al pannello di gestione."
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Accesso…" : "Accedi"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
      <LoginForm />
    </Suspense>
  );
}
