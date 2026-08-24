/**
 * Static QA fixture — Review card in TEST mode for screenshots.
 */
export default function QaTestModeReviewPage() {
  return (
    <main className="min-h-screen bg-stone-100 p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
          <span className="text-sm text-stone-700">Selezionati: 1</span>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Approva e avvia test 1
          </button>
        </div>

        <article className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">Trattoria Duomo</h3>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
              TEST
            </span>
            <span className="text-xs text-stone-400">restaurant · Milano</span>
          </div>
          <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
            Lead: Trattoria Duomo · Destinatario commerciale: info@trattoriaduomo.it · Destinatario
            effettivo TEST: attiliomazzetti@gmail.com
          </p>
          <p className="mt-2 truncate text-sm font-medium text-stone-700">
            Abbiamo preparato un&apos;anteprima per Trattoria Duomo
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">
            Concept dimostrativo Restaurant Premium V3 — apri la demo e dimmi cosa ne pensi.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Approva e avvia test
            </button>
            <button
              type="button"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700"
            >
              Modifica bozza
            </button>
          </div>
        </article>
      </div>
    </main>
  );
}
