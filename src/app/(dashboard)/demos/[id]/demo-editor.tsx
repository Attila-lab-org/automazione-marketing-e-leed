"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DemoRenderer from "@/components/templates/demo-renderer";
import type { DemoInstanceData } from "@/lib/templates/restaurant-premium";
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from "@/lib/templates/restaurant-premium-v2";
import {
  RESTAURANT_PREMIUM_V3_DEFAULTS,
  RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  type DemoInstanceDataV3,
} from "@/lib/templates/restaurant-premium-v3";
import type { KnownRendererKey } from "@/lib/templates/registry";

type AnyData = DemoInstanceData | DemoInstanceDataV2 | DemoInstanceDataV3;

type DemoPayload = {
  id: string;
  slug: string;
  publicPath: string;
  rendererKey: KnownRendererKey;
  data: AnyData;
  template: { name: string; version: number; key: string };
  lead: { name: string };
};

function linesToList(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400";

export default function DemoEditor({ demoId }: { demoId: string }) {
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [draft, setDraft] = useState<AnyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [imagesText, setImagesText] = useState("");
  const [galleryText, setGalleryText] = useState("");
  const [highlightsText, setHighlightsText] = useState("");

  const isV3 = demo?.rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY;
  const isV2 = demo?.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY;
  const isModern = isV2 || isV3;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/demos/${demoId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Demo non trovata");
        if (cancelled) return;
        const loaded = data.demo as DemoPayload;
        setDemo(loaded);
        setDraft(loaded.data);
        if (
          loaded.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY ||
          loaded.rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY
        ) {
          const modern = loaded.data as DemoInstanceDataV2 | DemoInstanceDataV3;
          setGalleryText((modern.branding.gallery ?? []).join("\n"));
          setHighlightsText((modern.content.highlights ?? []).join("\n"));
          setImagesText("");
        } else {
          const v1 = loaded.data as DemoInstanceData;
          setImagesText((v1.branding.images ?? []).join("\n"));
          setGalleryText("");
          setHighlightsText("");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore");
      });
    return () => {
      cancelled = true;
    };
  }, [demoId]);

  const previewData = useMemo(() => {
    if (!draft || !demo) return null;
    if (isModern) {
      const modern = draft as DemoInstanceDataV2 | DemoInstanceDataV3;
      return {
        ...modern,
        branding: { ...modern.branding, gallery: linesToList(galleryText) },
        content: { ...modern.content, highlights: linesToList(highlightsText) },
      };
    }
    const v1 = draft as DemoInstanceData;
    return {
      ...v1,
      branding: { ...v1.branding, images: linesToList(imagesText) },
    };
  }, [draft, demo, galleryText, highlightsText, imagesText, isModern]);

  async function onSave() {
    if (!draft || !demo) return;
    setSaving(true);
    setError(null);
    try {
      let payload: {
        branding: Record<string, unknown>;
        content: Record<string, unknown>;
        contact: Record<string, unknown>;
        signals?: Record<string, unknown>;
      };

      if (isModern) {
        const modern = draft as DemoInstanceDataV2 | DemoInstanceDataV3;
        payload = {
          branding: { ...modern.branding, gallery: linesToList(galleryText) },
          content: { ...modern.content, highlights: linesToList(highlightsText) },
          contact: { ...modern.contact },
          signals: { ...modern.signals },
        };
      } else {
        const v1 = draft as DemoInstanceData;
        payload = {
          branding: { ...v1.branding, images: linesToList(imagesText) },
          content: { ...v1.content },
          contact: { ...v1.contact },
        };
      }

      const res = await fetch(`/api/demos/${demoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Salvataggio fallito");
      const saved = data.demo as DemoPayload;
      setDemo(saved);
      setDraft(saved.data);
      if (
        saved.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY ||
        saved.rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY
      ) {
        const modern = saved.data as DemoInstanceDataV2 | DemoInstanceDataV3;
        setGalleryText((modern.branding.gallery ?? []).join("\n"));
        setHighlightsText((modern.content.highlights ?? []).join("\n"));
      }
      setSavedAt(new Date().toLocaleTimeString("it-IT"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  }

  function resetV3Defaults() {
    if (!isV3 || !draft) return;
    const current = draft as DemoInstanceDataV3;
    const next: DemoInstanceDataV3 = {
      ...RESTAURANT_PREMIUM_V3_DEFAULTS,
      branding: {
        ...RESTAURANT_PREMIUM_V3_DEFAULTS.branding,
        business_name: current.branding.business_name,
      },
      contact: { ...current.contact },
      signals: { ...current.signals },
    };
    setDraft(next);
    setGalleryText(next.branding.gallery.join("\n"));
    setHighlightsText(next.content.highlights.join("\n"));
  }

  if (error && !draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!draft || !demo || !previewData) {
    return <p className="text-sm text-stone-500">Caricamento modifica anteprima…</p>;
  }

  const modern = isModern ? (draft as DemoInstanceDataV2 | DemoInstanceDataV3) : null;
  const v3 = isV3 ? (draft as DemoInstanceDataV3) : null;
  const v1 = !isModern ? (draft as DemoInstanceData) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <form
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Modifica anteprima</p>
          <h1 className="text-lg font-semibold text-stone-900">{demo.template.name}</h1>
          <p className="text-xs text-stone-500">
            {demo.rendererKey} · v{demo.template.version}
          </p>
        </div>

        {modern ? (
          <>
            <Field label="Nome attività">
              <input
                className={inputClass}
                value={modern.branding.business_name ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    branding: { ...modern.branding, business_name: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Indirizzo del logo">
              <input
                className={inputClass}
                value={modern.branding.logo_url ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    branding: { ...modern.branding, logo_url: e.target.value || null },
                  })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Colore principale">
                <input
                  type="color"
                  className="h-10 w-full cursor-pointer rounded-lg border border-stone-200"
                  value={modern.branding.primary_color ?? "#2c241e"}
                  onChange={(e) =>
                    setDraft({
                      ...modern,
                      branding: { ...modern.branding, primary_color: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Colore dei pulsanti">
                <input
                  type="color"
                  className="h-10 w-full cursor-pointer rounded-lg border border-stone-200"
                  value={modern.branding.accent_color ?? "#b86a45"}
                  onChange={(e) =>
                    setDraft({
                      ...modern,
                      branding: { ...modern.branding, accent_color: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Indirizzo dell’immagine principale">
              <input
                className={inputClass}
                value={modern.branding.hero_image ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    branding: { ...modern.branding, hero_image: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Galleria (un indirizzo immagine per riga)">
              <textarea
                className={`${inputClass} min-h-24`}
                value={galleryText}
                onChange={(e) => setGalleryText(e.target.value)}
              />
            </Field>
            <Field label="Titolo principale">
              <input
                className={inputClass}
                value={modern.content.headline ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    content: { ...modern.content, headline: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Sottotitolo">
              <textarea
                className={`${inputClass} min-h-20`}
                value={modern.content.subheadline ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    content: { ...modern.content, subheadline: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Descrizione">
              <textarea
                className={`${inputClass} min-h-24`}
                value={modern.content.description ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    content: { ...modern.content, description: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Testo del pulsante">
              <input
                className={inputClass}
                value={modern.content.cta ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    content: { ...modern.content, cta: e.target.value || null },
                  })
                }
              />
            </Field>
            {v3 ? (
              <>
                <Field label="Dove porta il pulsante">
                  <input
                    className={inputClass}
                    value={v3.content.cta_url ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...v3,
                        content: { ...v3.content, cta_url: e.target.value || null },
                      })
                    }
                  />
                </Field>
                <Field label="Testo del contatto commerciale">
                  <input
                    className={inputClass}
                    value={v3.content.owner_cta_label ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...v3,
                        content: { ...v3.content, owner_cta_label: e.target.value || null },
                      })
                    }
                  />
                </Field>
                <Field label="Dove porta il contatto commerciale">
                  <input
                    className={inputClass}
                    value={v3.content.owner_cta_url ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...v3,
                        content: { ...v3.content, owner_cta_url: e.target.value || null },
                      })
                    }
                  />
                </Field>
              </>
            ) : null}
            <Field label="Telefono">
              <input
                className={inputClass}
                value={modern.contact.phone ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    contact: { ...modern.contact, phone: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Indirizzo">
              <input
                className={inputClass}
                value={modern.contact.address ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    contact: { ...modern.contact, address: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Città">
              <input
                className={inputClass}
                value={modern.contact.city ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    contact: { ...modern.contact, city: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Orari di apertura">
              <textarea
                className={`${inputClass} min-h-20`}
                value={modern.contact.opening_hours ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...modern,
                    contact: { ...modern.contact, opening_hours: e.target.value || null },
                  })
                }
              />
            </Field>
            <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-500">
              Rating Google: {modern.signals.rating ?? "—"} · Recensioni:{" "}
              {modern.signals.review_count ?? "—"} (read-only)
            </div>
          </>
        ) : v1 ? (
          <>
            <Field label="Nome attività">
              <input
                className={inputClass}
                value={v1.branding.business_name ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...v1,
                    branding: { ...v1.branding, business_name: e.target.value || null },
                  })
                }
              />
            </Field>
            <Field label="Immagini">
              <textarea
                className={`${inputClass} min-h-24`}
                value={imagesText}
                onChange={(e) => setImagesText(e.target.value)}
              />
            </Field>
          </>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            title="Salva tutte le modifiche fatte all’anteprima."
            disabled={saving}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
          {isV3 ? (
            <button
              type="button"
              onClick={resetV3Defaults}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700"
            >
              Reset to V3 default
            </button>
          ) : null}
          <Link
            href={demo.publicPath}
            target="_blank"
            className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700"
          >
            Apri demo
          </Link>
        </div>
        {savedAt ? <p className="text-xs text-stone-400">Salvato alle {savedAt}</p> : null}
      </form>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
        <div className="border-b border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
          Anteprima in tempo reale · modello {demo.rendererKey}
        </div>
        <div className="max-h-[80vh] overflow-auto">
          <DemoRenderer rendererKey={demo.rendererKey} data={previewData as AnyData} compact />
        </div>
      </div>
    </div>
  );
}
