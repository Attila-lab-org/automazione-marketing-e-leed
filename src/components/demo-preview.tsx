"use client";

import { useState, type ReactNode } from "react";

export type DemoPreviewProps = {
  /** URL pubblico della demo (§10). Se assente, i pulsanti sono disabilitati. */
  demoUrl?: string;
  templateName?: string;
  templateVersion?: string;
  /** Contenuto del frame; default: skeleton placeholder del layout demo. */
  children?: ReactNode;
};

/**
 * DemoPreview — §21 inventory / §7.3.
 * Frame con toggle desktop/mobile, indicazione template/versione e azioni
 * "Apri demo pubblica" / "Copia URL". La preview esiste sempre,
 * indipendentemente dalla policy.
 */
export default function DemoPreview({
  demoUrl,
  templateName,
  templateVersion,
  children,
}: DemoPreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    if (!demoUrl) return;
    try {
      await navigator.clipboard.writeText(demoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard non disponibile: l'URL resta visibile e copiabile a mano
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
        <div
          role="group"
          aria-label="Formato anteprima"
          className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5"
        >
          {(
            [
              { key: "desktop", label: "Computer" },
              { key: "mobile", label: "Telefono" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              title={`Mostra l’anteprima nel formato ${option.label.toLowerCase()}.`}
              onClick={() => setViewport(option.key)}
              aria-pressed={viewport === option.key}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewport === option.key
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {templateName ? (
          <p className="text-xs text-stone-500">
            Modello <span className="font-medium">{templateName}</span>
            {templateVersion ? (
              <>
                {" "}
                · <span className="font-mono">{templateVersion}</span>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <a
            href={demoUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-disabled={!demoUrl}
            title={
              demoUrl
                ? "Apre l’anteprima pubblica in una nuova scheda."
                : "Nessuna anteprima pubblicata."
            }
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              demoUrl
                ? "border-stone-300 text-stone-700 hover:bg-stone-50"
                : "pointer-events-none border-stone-200 text-stone-300"
            }`}
          >
            Apri anteprima pubblica ↗
          </a>
          <button
            type="button"
            title="Copia l’indirizzo pubblico dell’anteprima."
            onClick={copyUrl}
            disabled={!demoUrl}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
          >
            {copied ? "URL copiato ✓" : "Copia URL"}
          </button>
        </div>
      </header>

      <div className="flex justify-center bg-stone-100 px-6 py-8">
        <div
          className={`overflow-hidden rounded-lg border border-stone-300 bg-white shadow-sm transition-all ${
            viewport === "desktop"
              ? "w-full max-w-3xl"
              : "w-full max-w-[22rem]"
          }`}
        >
          {/* Chrome finto del browser */}
          <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50 px-3 py-2">
            <span className="flex gap-1" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-stone-300" />
              <span className="h-2 w-2 rounded-full bg-stone-300" />
              <span className="h-2 w-2 rounded-full bg-stone-300" />
            </span>
            <span className="flex-1 truncate rounded bg-white px-2 py-0.5 text-center font-mono text-[10px] text-stone-400">
              {demoUrl ?? "demo.non-ancora-generata"}
            </span>
          </div>
          <div className={viewport === "mobile" ? "min-h-96" : "min-h-72"}>
            {children ?? (
              <div className="space-y-4 p-6">
                <div className="h-6 w-2/3 rounded bg-stone-200" />
                <div className="h-3 w-full rounded bg-stone-100" />
                <div className="h-3 w-5/6 rounded bg-stone-100" />
                <div className="h-24 w-full rounded-lg bg-stone-100" />
                <div className="h-9 w-40 rounded-lg bg-amber-200" />
                <p className="pt-2 text-center text-xs text-stone-400">
                  L’anteprima completa sarà disponibile quando il modello sarà pronto.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
