"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RestaurantPremium from "@/components/templates/restaurant-premium";
import type { DemoInstanceData } from "@/lib/templates/restaurant-premium";

type DemoPayload = {
  id: string;
  slug: string;
  publicPath: string;
  data: DemoInstanceData;
  template: { name: string; version: number; key: string };
  lead: { name: string };
};

export default function DemoEditor({ demoId }: { demoId: string }) {
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [draft, setDraft] = useState<DemoInstanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [imagesText, setImagesText] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/demos/${demoId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Demo non trovata");
        if (cancelled) return;
        setDemo(data.demo);
        setDraft(data.demo.data);
        setImagesText((data.demo.data.branding.images ?? []).join("\n"));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore");
      });
    return () => {
      cancelled = true;
    };
  }, [demoId]);

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const images = imagesText
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/demos/${demoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: { ...draft.branding, images },
          content: draft.content,
          contact: draft.contact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Salvataggio fallito");
      setDemo(data.demo);
      setDraft(data.demo.data);
      setImagesText((data.demo.data.branding.images ?? []).join("\n"));
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
  if (!draft || !demo) {
    return <p className="text-sm text-stone-500">Caricamento editor…</p>;
  }

  const preview = {
    ...draft,
    branding: {
      ...draft.branding,
      images: imagesText
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };

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
          </p>
          <h2 className="mt-1 text-base font-semibold text-stone-900">Editor campi</h2>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Branding
          </legend>
          <Field
            label="Nome"
            value={draft.branding.business_name ?? ""}
            onChange={(v) =>
              setDraft({
                ...draft,
                branding: { ...draft.branding, business_name: v || null },
              })
            }
          />
          <Field
            label="Logo URL"
            value={draft.branding.logo_url ?? ""}
            onChange={(v) =>
              setDraft({
                ...draft,
                branding: { ...draft.branding, logo_url: v || null },
              })
            }
          />
          <Field
            label="Colore primario"
            type="color"
            value={draft.branding.primary_color ?? "#1c1917"}
            onChange={(v) =>
              setDraft({
                ...draft,
                branding: { ...draft.branding, primary_color: v || null },
              })
            }
          />
          <Field
            label="Colore accent"
            type="color"
            value={draft.branding.accent_color ?? "#d97706"}
            onChange={(v) =>
              setDraft({
                ...draft,
                branding: { ...draft.branding, accent_color: v || null },
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
            value={draft.content.headline ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, content: { ...draft.content, headline: v || null } })
            }
          />
          <label className="block text-xs font-medium text-stone-600">
            Descrizione
            <textarea
              value={draft.content.description ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  content: { ...draft.content, description: e.target.value || null },
                })
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <Field
            label="CTA"
            value={draft.content.cta ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, content: { ...draft.content, cta: v || null } })
            }
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Contatti
          </legend>
          <Field
            label="Telefono"
            value={draft.contact.phone ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, contact: { ...draft.contact, phone: v || null } })
            }
          />
          <Field
            label="Indirizzo"
            value={draft.contact.address ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, contact: { ...draft.contact, address: v || null } })
            }
          />
          <Field
            label="Email"
            value={draft.contact.email ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, contact: { ...draft.contact, email: v || null } })
            }
          />
          <Field
            label="Città"
            value={draft.contact.city ?? ""}
            onChange={(v) =>
              setDraft({ ...draft, contact: { ...draft.contact, city: v || null } })
            }
          />
        </fieldset>

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
        <RestaurantPremium data={preview} compact />
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
