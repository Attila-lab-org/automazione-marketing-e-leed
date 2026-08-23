export type MessagePreviewProps = {
  /** Oggetto dell'email con variabili già risolte (§7.3). */
  subject: string;
  /** Corpo del messaggio con variabili già risolte. */
  body: string;
  /** URL della demo pubblica citata nel messaggio. */
  demoUrl?: string;
  /** Etichetta dello screenshot allegato, es. "screenshot-desktop.png". */
  screenshotLabel?: string;
  templateName?: string;
  templateVersion?: string;
  /** Policy che autorizzerebbe l'invio, mostrata come nota (§7.3). */
  policyNote?: string;
};

/**
 * MessagePreview — §21 inventory.
 * Anteprima del messaggio con variabili risolte, riferimento a screenshot
 * e link demo, più indicazione di template/versione (§7.3).
 */
export default function MessagePreview({
  subject,
  body,
  demoUrl,
  screenshotLabel,
  templateName,
  templateVersion,
  policyNote,
}: MessagePreviewProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="border-b border-stone-100 bg-stone-50 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
          Anteprima messaggio — variabili risolte
        </p>
        {templateName ? (
          <p className="mt-1 text-xs text-stone-500">
            Template: <span className="font-medium">{templateName}</span>
            {templateVersion ? (
              <>
                {" "}
                · versione <span className="font-mono">{templateVersion}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-stone-900">
          Oggetto: {subject}
        </p>
        <div className="mt-3 whitespace-pre-line rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
          {body}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {demoUrl ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-600">
              <span aria-hidden>🔗</span>
              Link demo: <span className="font-mono">{demoUrl}</span>
            </span>
          ) : null}
          {screenshotLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-600">
              <span aria-hidden>🖼</span>
              Allegato: <span className="font-mono">{screenshotLabel}</span>
            </span>
          ) : null}
        </div>
        {policyNote ? (
          <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
            <span className="font-medium text-stone-600">
              Policy che autorizzerebbe l&rsquo;invio:
            </span>{" "}
            {policyNote}
          </p>
        ) : null}
      </div>
    </article>
  );
}
