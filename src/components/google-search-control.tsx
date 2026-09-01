"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DISCOVERY_CATEGORIES } from "@/lib/leads/discovery-categories";

export default function GoogleSearchControl({
  redirectToLeads = false,
}: {
  redirectToLeads?: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState("Ristoranti");
  const [location, setLocation] = useState("Milano");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          location: location.trim(),
          maxResults: 20,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ricerca non riuscita");
      setFeedback(data.message ?? "Ricerca completata.");
      if (redirectToLeads) {
        router.push("/leads");
        router.refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ricerca non riuscita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-base font-semibold text-stone-900">Cerca su Google</h2>
      <p className="mt-1 text-sm text-stone-600">
        Trova attività per settore e città. I risultati vanno in Contatti.
      </p>
      <form onSubmit={onSearch} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-stone-700">
          Settore
          <input
            required
            list="control-discovery-categories"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Es. Ristoranti"
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <datalist id="control-discovery-categories">
            {DISCOVERY_CATEGORIES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Città o zona
          <input
            required
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Es. Milano"
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Cerco su Google…" : "Avvia ricerca"}
        </button>
      </form>
      {feedback ? <p className="mt-3 text-sm text-emerald-800">{feedback}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
