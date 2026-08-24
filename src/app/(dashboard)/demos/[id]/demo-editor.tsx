"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DemoRenderer from "@/components/templates/demo-renderer";
import type { DemoInstanceData } from "@/lib/templates/restaurant-premium";
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from "@/lib/templates/restaurant-premium-v2";
import type { KnownRendererKey } from "@/lib/templates/registry";

type DemoPayload = {
  id: string;
  slug: string;
  publicPath: string;
  rendererKey: KnownRendererKey;
  data: DemoInstanceData | DemoInstanceDataV2;
  template: { name: string; version: number; key: string };
  lead: { name: string };
};

function linesToList(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function DemoEditor({ demoId }: { demoId: string }) {
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [draft, setDraft] = useState<DemoInstanceData | DemoInstanceDataV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [imagesText, setImagesText] = useState("");
  const [galleryText, setGalleryText] = useState("");
  const [highlightsText, setHighlightsText] = useState("");

  const isV2 = demo?.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY;

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
        if (loaded.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
          const v2 = loaded.data as DemoInstanceDataV2;
          setGalleryText((v2.branding.gallery ?? []).join("\n"));
          setHighlightsText((v2.content.highlights ?? []).join("\n"));
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
    if (demo.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
      const v2 = draft as DemoInstanceDataV2;
      return {
        ...v2,
        branding: {
          ...v2.branding,
          gallery: linesToList(galleryText),
        },
        content: {
          ...v2.content,
          highlights: linesToList(highlightsText),
        },
      } satisfies DemoInstanceDataV2;
    }
    const v1 = draft as DemoInstanceData;
    return {
      ...v1,
      branding: {
        ...v1.branding,
        images: linesToList(imagesText),
      },
    } satisfies DemoInstanceData;
  }, [draft, demo, galleryText, highlightsText, imagesText]);

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

      if (demo.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
        const v2 = draft as DemoInstanceDataV2;
        payload = {
          branding: {
            ...v2.branding,
            gallery: linesToList(galleryText),
          },
          content: {
            ...v2.content,
            highlights: linesToList(highlightsText),
          },
          contact: { ...v2.contact },
          signals: { ...v2.signals },
        };
      } else {
        const v1 = draft as DemoInstanceData;
        payload = {
          branding: {
            ...v1.branding,
            images: linesToList(imagesText),
          },
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
      if (saved.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
        const v2 = saved.data as DemoInstanceDataV2;
        setGalleryText((v2.branding.gallery ?? []).join("\n"));
        setHighlightsText((v2.content.highlights ?? []).join("\n"));
      } else {
        const v1 = saved.data as DemoInstanceData;
        setImagesText((v1.branding.images ?? []).join("\n"));
      }
      setSavedAt(new Date().toLocaleTimeString("it-IT"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  }

  if (error && !draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!draft || !demo || !previewData) {
    return <p className="text-sm text-stone-500">Caricamento editor…</p>;
  }

  const v2Draft = isV2 ? (draft as DemoInstanceDataV2) : null;
  const v1Draft = !isV2 ? (draft as DemoInstanceData) : null;

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
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            {demo.template.name} · v{demo.template.version}
            {isV2 ? " · V2" : " · V1"}
          </p>
          <h2 className="mt-1 text-base font-semibold text-stone-900">Editor campi</h2>
        </div>

        {v2Draft ? (
          <>
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Branding
              </legend>
              <Field
                label="Nome attività"
                value={v2Draft.branding.business_name ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    branding: { ...v2Draft.branding, business_name: v || null },
                  })
                }
              />
              <Field
                label="Logo URL"
                value={v2Draft.branding.logo_url ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    branding: { ...v2Draft.branding, logo_url: v || null },
                  })
                }
              />
              <Field
                label="Colore primario"
                type="color"
                value={v2Draft.branding.primary_color ?? "#1c1917"}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    branding: { ...v2Draft.branding, primary_color: v || null },
                  })
                }
              />
              <Field
                label="Colore accent"
                type="color"
                value={v2Draft.branding.accent_color ?? "#d97706"}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    branding: { ...v2Draft.branding, accent_color: v || null },
                  })
                }
              />
              <Field
                label="Hero image URL"
                value={v2Draft.branding.hero_image ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    branding: { ...v2Draft.branding, hero_image: v || null },
                  })
                }
              />
              <label className="block text-xs font-medium text-stone-600">
                Gallery (un URL per riga)
                <textarea
                  value={galleryText}
                  onChange={(e) => setGalleryText(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs"
                />
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Contenuto
              </legend>
              <Field
                label="Headline"
                value={v2Draft.content.headline ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    content: { ...v2Draft.content, headline: v || null },
                  })
                }
              />
              <Field
                label="Subheadline"
                value={v2Draft.content.subheadline ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    content: { ...v2Draft.content, subheadline: v || null },
                  })
                }
              />
              <label className="block text-xs font-medium text-stone-600">
                Descrizione
                <textarea
                  value={v2Draft.content.description ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...v2Draft,
                      content: { ...v2Draft.content, description: e.target.value || null },
                    })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-stone-600">
                About
                <textarea
                  value={v2Draft.content.about ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...v2Draft,
                      content: { ...v2Draft.content, about: e.target.value || null },
                    })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-stone-600">
                Punti di forza (una riga ciascuno)
                <textarea
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <Field
                label="CTA"
                value={v2Draft.content.cta ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    content: { ...v2Draft.content, cta: v || null },
                  })
                }
              />
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Contatti
              </legend>
              <Field
                label="Telefono"
                value={v2Draft.contact.phone ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    contact: { ...v2Draft.contact, phone: v || null },
                  })
                }
              />
              <Field
                label="Indirizzo"
                value={v2Draft.contact.address ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    contact: { ...v2Draft.contact, address: v || null },
                  })
                }
              />
              <Field
                label="Email"
                value={v2Draft.contact.email ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    contact: { ...v2Draft.contact, email: v || null },
                  })
                }
              />
              <Field
                label="Città"
                value={v2Draft.contact.city ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v2Draft,
                    contact: { ...v2Draft.contact, city: v || null },
                  })
                }
              />
              <label className="block text-xs font-medium text-stone-600">
                Orari di apertura
                <textarea
                  value={v2Draft.contact.opening_hours ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...v2Draft,
                      contact: { ...v2Draft.contact, opening_hours: e.target.value || null },
                    })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Segnali (sola lettura)
              </legend>
              <p className="text-sm text-stone-600">
                Rating:{" "}
                <span className="font-mono">
                  {v2Draft.signals.rating != null ? v2Draft.signals.rating : "—"}
                </span>
              </p>
              <p className="text-sm text-stone-600">
                Recensioni:{" "}
                <span className="font-mono">
                  {v2Draft.signals.review_count != null ? v2Draft.signals.review_count : "—"}
                </span>
              </p>
            </fieldset>
          </>
        ) : null}

        {v1Draft ? (
          <>
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Branding
              </legend>
              <Field
                label="Nome"
                value={v1Draft.branding.business_name ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    branding: { ...v1Draft.branding, business_name: v || null },
                  })
                }
              />
              <Field
                label="Logo URL"
                value={v1Draft.branding.logo_url ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    branding: { ...v1Draft.branding, logo_url: v || null },
                  })
                }
              />
              <Field
                label="Colore primario"
                type="color"
                value={v1Draft.branding.primary_color ?? "#1c1917"}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    branding: { ...v1Draft.branding, primary_color: v || null },
                  })
                }
              />
              <Field
                label="Colore accent"
                type="color"
                value={v1Draft.branding.accent_color ?? "#d97706"}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    branding: { ...v1Draft.branding, accent_color: v || null },
                  })
                }
              />
              <label className="block text-xs font-medium text-stone-600">
                Immagini (un URL per riga)
                <textarea
                  value={imagesText}
                  onChange={(e) => setImagesText(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs"
                />
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Contenuto
              </legend>
              <Field
                label="Headline"
                value={v1Draft.content.headline ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    content: { ...v1Draft.content, headline: v || null },
                  })
                }
              />
              <label className="block text-xs font-medium text-stone-600">
                Descrizione
                <textarea
                  value={v1Draft.content.description ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...v1Draft,
                      content: { ...v1Draft.content, description: e.target.value || null },
                    })
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <Field
                label="CTA"
                value={v1Draft.content.cta ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    content: { ...v1Draft.content, cta: v || null },
                  })
                }
              />
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Contatti
              </legend>
              <Field
                label="Telefono"
                value={v1Draft.contact.phone ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    contact: { ...v1Draft.contact, phone: v || null },
                  })
                }
              />
              <Field
                label="Indirizzo"
                value={v1Draft.contact.address ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    contact: { ...v1Draft.contact, address: v || null },
                  })
                }
              />
              <Field
                label="Email"
                value={v1Draft.contact.email ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    contact: { ...v1Draft.contact, email: v || null },
                  })
                }
              />
              <Field
                label="Città"
                value={v1Draft.contact.city ?? ""}
                onChange={(v) =>
                  setDraft({
                    ...v1Draft,
                    contact: { ...v1Draft.contact, city: v || null },
                  })
                }
              />
            </fieldset>
          </>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {savedAt ? (
          <p className="text-xs text-emerald-700">Salvato alle {savedAt}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
          <a
            href={demo.publicPath}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Anteprima pubblica
          </a>
          <Link href="/demos" className="px-3 py-2 text-sm text-stone-500 hover:text-stone-800">
            Torna alle demo
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
        <div className="border-b border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
          Anteprima live · {demo.publicPath}
        </div>
        <DemoRenderer rendererKey={demo.rendererKey} data={previewData} compact />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs font-medium text-stone-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm ${
          type === "color" ? "h-10 p-1" : ""
        }`}
      />
    </label>
  );
}
