"use client";

import { useEffect, useState } from "react";
import type { CommercialPlaybook } from "@/lib/sales/playbook";

export default function CommercialPlaybookPanel() {
  const [playbook, setPlaybook] = useState<CommercialPlaybook | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/playbook")
      .then((r) => r.json())
      .then((data) => setPlaybook(data.playbook ?? null))
      .catch(() => setError("Playbook non caricato"));
  }, []);

  async function save() {
    if (!playbook) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/playbook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Salvataggio fallito");
      setPlaybook(data.playbook);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  if (!playbook) {
    return <p className="text-sm text-stone-500">Caricamento playbook…</p>;
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Commercial Playbook</h2>
        <p className="text-xs text-stone-500">
          Limiti di ciò che l’AI può dire, promettere e decidere da sola. Versione {playbook.version}.
        </p>
      </div>
      <label className="block text-sm">
        Nome studio
        <input
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          value={playbook.brand.name}
          onChange={(e) =>
            setPlaybook({ ...playbook, brand: { ...playbook.brand, name: e.target.value } })
          }
        />
      </label>
      <label className="block text-sm">
        Firma
        <input
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          value={playbook.brand.signature}
          onChange={(e) =>
            setPlaybook({ ...playbook, brand: { ...playbook.brand, signature: e.target.value } })
          }
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={playbook.pricing.aiMayCommunicate}
          onChange={(e) =>
            setPlaybook({
              ...playbook,
              pricing: { ...playbook.pricing, aiMayCommunicate: e.target.checked },
            })
          }
        />
        L’AI può comunicare il prezzo
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Prezzo minimo
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={playbook.pricing.min ?? ""}
            onChange={(e) =>
              setPlaybook({
                ...playbook,
                pricing: {
                  ...playbook.pricing,
                  min: e.target.value ? Number(e.target.value) : null,
                },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Prezzo massimo
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={playbook.pricing.max ?? ""}
            onChange={(e) =>
              setPlaybook({
                ...playbook,
                pricing: {
                  ...playbook.pricing,
                  max: e.target.value ? Number(e.target.value) : null,
                },
              })
            }
          />
        </label>
      </div>
      <label className="block text-sm">
        URL prenotazione call
        <input
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
          value={playbook.call.bookingUrl ?? ""}
          onChange={(e) =>
            setPlaybook({
              ...playbook,
              call: { ...playbook.call, bookingUrl: e.target.value || null },
            })
          }
        />
      </label>
      <p className="text-xs text-stone-500">
        Sconti: solo umano. Unsubscribe e stop sono automatici. Prima risposta: approvazione
        richiesta.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva playbook"}
      </button>
    </section>
  );
}
