"use client";

import { useEffect, useState } from "react";
import type { CommercialPlaybook, ResponseMode } from "@/lib/sales/playbook";

type Preset = "assistito" | "equilibrato" | "autonomo";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100";
const cardClass = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";

function csv(value: string[]): string {
  return value.join(", ");
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function autonomyLabel(playbook: CommercialPlaybook): string {
  if (
    playbook.autonomy.defaultMode === "AUTO_ALLOWED" &&
    playbook.autonomy.firstReplyMode === "AUTO_ALLOWED"
  ) {
    return "Autonomo";
  }
  if (playbook.autonomy.simpleFaqMode === "AUTO_ALLOWED") return "Equilibrato";
  return "Assistito";
}

export default function CommercialPlaybookPanel() {
  const [playbook, setPlaybook] = useState<CommercialPlaybook | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/playbook")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Playbook non caricato");
        setPlaybook(data.playbook ?? null);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Playbook non caricato"),
      );
  }, []);

  function update(next: CommercialPlaybook) {
    setPlaybook(next);
    setDirty(true);
    setNotice(null);
  }

  function applyPreset(preset: Preset) {
    if (!playbook) return;
    const modes: Record<Preset, [ResponseMode, ResponseMode, ResponseMode]> = {
      assistito: ["APPROVAL_REQUIRED", "APPROVAL_REQUIRED", "APPROVAL_REQUIRED"],
      equilibrato: ["AUTO_ALLOWED", "APPROVAL_REQUIRED", "AUTO_ALLOWED"],
      autonomo: ["AUTO_ALLOWED", "AUTO_ALLOWED", "AUTO_ALLOWED"],
    };
    const [defaultMode, firstReplyMode, simpleFaqMode] = modes[preset];
    const pricingReady = playbook.pricing.min != null && playbook.pricing.max != null;
    const discountReady = playbook.discount.maxAutomatic != null;
    update({
      ...playbook,
      pricing: {
        ...playbook.pricing,
        aiMayCommunicate:
          preset === "assistito" ? false : pricingReady && playbook.pricing.mode !== "hidden",
      },
      discount: {
        ...playbook.discount,
        allowed: preset === "autonomo" && pricingReady && discountReady,
      },
      autonomy: { defaultMode, firstReplyMode, simpleFaqMode },
      humanEscalation: {
        ...playbook.humanEscalation,
        price: preset === "assistito",
        discount: preset !== "autonomo",
      },
    });
  }

  async function save() {
    if (!playbook) return;
    if (
      playbook.pricing.aiMayCommunicate &&
      (playbook.pricing.min == null ||
        playbook.pricing.max == null ||
        playbook.pricing.min > playbook.pricing.max)
    ) {
      setError("Controlla i prezzi: servono minimo e standard, con minimo non superiore allo standard.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/playbook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Salvataggio fallito");
      setPlaybook(data.playbook);
      setDirty(false);
      setNotice("Impostazioni salvate. Attila userà subito queste regole.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  if (!playbook) {
    return (
      <div className={`${cardClass} animate-pulse text-sm text-stone-500`}>
        Sto caricando il centro di controllo…
      </div>
    );
  }

  const status = autonomyLabel(playbook);

  return (
    <div className="space-y-5 pb-24">
      <section className="overflow-hidden rounded-2xl bg-stone-950 text-white shadow-sm">
        <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              Attila è in modalità {status}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Centro di controllo commerciale</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
              Scegli quanto può agire da sola. Tutto resta modificabile e le regole importanti sono
              sempre visibili.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <p className="text-stone-400">Versione regole</p>
            <p className="mt-1 text-xl font-semibold">{playbook.version}</p>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4">
          <h3 className="font-semibold text-stone-950">1. Scegli il livello di autonomia</h3>
          <p className="mt-1 text-sm text-stone-500">
            Puoi partire da un preset e cambiare ogni singola regola sotto.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              id: "assistito" as const,
              title: "Assistito",
              body: "Prepara le risposte, ma le decisioni commerciali restano a te.",
            },
            {
              id: "equilibrato" as const,
              title: "Equilibrato",
              body: "Gestisce FAQ e conversazioni normali; la prima risposta resta controllata.",
            },
            {
              id: "autonomo" as const,
              title: "Autonomo",
              body: "Risponde, comunica prezzi e negozia entro i limiti configurati.",
            },
          ].map((preset) => {
            const selected = status.toLowerCase() === preset.title.toLowerCase();
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-amber-600 bg-amber-50 ring-2 ring-amber-100"
                    : "border-stone-200 hover:border-stone-400"
                }`}
              >
                <span className="text-sm font-semibold text-stone-950">{preset.title}</span>
                <span className="mt-1 block text-xs leading-5 text-stone-600">{preset.body}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={cardClass}>
        <h3 className="font-semibold text-stone-950">2. Identità e offerta</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-stone-700">
            Nome attività
            <input
              className={inputClass}
              value={playbook.brand.name}
              onChange={(event) =>
                update({ ...playbook, brand: { ...playbook.brand, name: event.target.value } })
              }
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Firma nei messaggi
            <input
              className={inputClass}
              value={playbook.brand.signature}
              onChange={(event) =>
                update({
                  ...playbook,
                  brand: { ...playbook.brand, signature: event.target.value },
                })
              }
            />
          </label>
          <label className="text-sm font-medium text-stone-700 sm:col-span-2">
            Cosa vendi
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              value={playbook.offer.description}
              onChange={(event) =>
                update({
                  ...playbook,
                  offer: { ...playbook.offer, description: event.target.value },
                })
              }
            />
          </label>
          <label className="text-sm font-medium text-stone-700 sm:col-span-2">
            Tono di voce
            <input
              className={inputClass}
              value={playbook.brand.tone}
              onChange={(event) =>
                update({ ...playbook, brand: { ...playbook.brand, tone: event.target.value } })
              }
              placeholder="Es. diretto, professionale, concreto, usa il tu"
            />
          </label>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-stone-950">3. Prezzi e negoziazione</h3>
            <p className="mt-1 text-sm text-stone-500">
              Attila non scenderà mai sotto il limite più prudente.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={playbook.pricing.aiMayCommunicate}
              onChange={(event) =>
                update({
                  ...playbook,
                  pricing: { ...playbook.pricing, aiMayCommunicate: event.target.checked },
                })
              }
            />
            Comunica prezzi
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-stone-700">
            Prezzo minimo inderogabile
            <input
              type="number"
              min={0}
              className={inputClass}
              value={playbook.pricing.min ?? ""}
              onChange={(event) =>
                update({
                  ...playbook,
                  pricing: {
                    ...playbook.pricing,
                    min: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Prezzo standard
            <input
              type="number"
              min={0}
              className={inputClass}
              value={playbook.pricing.max ?? ""}
              onChange={(event) =>
                update({
                  ...playbook,
                  pricing: {
                    ...playbook.pricing,
                    max: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Strategia
            <select
              className={inputClass}
              value={playbook.pricing.mode}
              onChange={(event) =>
                update({
                  ...playbook,
                  pricing: {
                    ...playbook.pricing,
                    mode: event.target.value as CommercialPlaybook["pricing"]["mode"],
                  },
                })
              }
            >
              <option value="range">Fascia negoziabile</option>
              <option value="fixed">Prezzo fisso</option>
              <option value="hidden">Prezzo nascosto</option>
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700">
            Sconto massimo automatico
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                className={`${inputClass} pr-10`}
                value={playbook.discount.maxAutomatic ?? ""}
                onChange={(event) =>
                  update({
                    ...playbook,
                    discount: {
                      ...playbook.discount,
                      maxAutomatic: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
              <span className="pointer-events-none absolute right-3 top-4 text-sm text-stone-400">%</span>
            </div>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 p-3 text-sm">
          <input
            type="checkbox"
            checked={playbook.discount.allowed}
            onChange={(event) =>
              update({
                ...playbook,
                discount: { ...playbook.discount, allowed: event.target.checked },
              })
            }
          />
          <span>
            <strong className="block text-stone-900">Permetti la negoziazione automatica</strong>
            <span className="text-xs text-stone-500">
              Accetta o contropropone senza superare lo sconto massimo e il prezzo minimo.
            </span>
          </span>
        </label>
      </section>

      <section className={cardClass}>
        <h3 className="font-semibold text-stone-950">4. Appuntamenti</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="text-sm font-medium text-stone-700">
            Link calendario, se ne usi uno esterno
            <input
              className={inputClass}
              value={playbook.call.bookingUrl ?? ""}
              onChange={(event) =>
                update({
                  ...playbook,
                  call: { ...playbook.call, bookingUrl: event.target.value || null },
                })
              }
              placeholder="Opzionale: Attila può usare anche gli slot interni"
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Durata chiamata
            <select
              className={inputClass}
              value={playbook.call.durationMinutes}
              onChange={(event) =>
                update({
                  ...playbook,
                  call: { ...playbook.call, durationMinutes: Number(event.target.value) },
                })
              }
            >
              {[15, 20, 30, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minuti
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setAdvanced((value) => !value)}
        className="flex w-full items-center justify-between rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-4 text-left"
      >
        <span>
          <strong className="block text-sm text-stone-900">Impostazioni avanzate</strong>
          <span className="text-xs text-stone-500">
            Qualificazione, promesse vietate, escalation e dettagli dell’offerta.
          </span>
        </span>
        <span className="text-xl text-stone-400">{advanced ? "−" : "+"}</span>
      </button>

      {advanced ? (
        <section className={`${cardClass} space-y-5`}>
          <label className="block text-sm font-medium text-stone-700">
            Funzioni comprese nell’offerta
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              value={csv(playbook.offer.allowedFeatures)}
              onChange={(event) =>
                update({
                  ...playbook,
                  offer: { ...playbook.offer, allowedFeatures: splitList(event.target.value) },
                })
              }
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Domande di qualificazione
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              value={playbook.qualification.questions.join("\n")}
              onChange={(event) =>
                update({
                  ...playbook,
                  qualification: {
                    ...playbook.qualification,
                    questions: splitList(event.target.value),
                  },
                })
              }
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Quando proporre la chiamata
            <input
              className={inputClass}
              value={playbook.call.proposeWhen}
              onChange={(event) =>
                update({
                  ...playbook,
                  call: { ...playbook.call, proposeWhen: event.target.value },
                })
              }
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Cose che Attila non deve mai promettere
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              value={playbook.promisePolicy.neverPromise.join("\n")}
              onChange={(event) =>
                update({
                  ...playbook,
                  promisePolicy: { neverPromise: splitList(event.target.value) },
                })
              }
            />
          </label>
          <div>
            <p className="text-sm font-medium text-stone-700">Quando deve chiamarti</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["contracts", "Contratti"],
                  ["legalPrivacy", "Legale e privacy"],
                  ["angry", "Cliente arrabbiato"],
                  ["highComplexity", "Richiesta complessa"],
                  ["lowConfidence", "AI poco sicura"],
                  ["highValue", "Cliente di alto valore"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={playbook.humanEscalation[key]}
                    onChange={(event) =>
                      update({
                        ...playbook,
                        humanEscalation: {
                          ...playbook.humanEscalation,
                          [key]: event.target.checked,
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="min-h-5 text-sm">
          {error ? <span className="text-red-700">{error}</span> : null}
          {!error && notice ? <span className="text-emerald-700">{notice}</span> : null}
          {!error && !notice && dirty ? (
            <span className="text-amber-700">Hai modifiche non salvate.</span>
          ) : null}
          {!error && !notice && !dirty ? (
            <span className="text-stone-500">Tutte le modifiche sono salvate.</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="rounded-xl bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Salvataggio…" : "Salva e applica"}
        </button>
      </div>
    </div>
  );
}
