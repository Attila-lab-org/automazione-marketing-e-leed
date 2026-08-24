import { notFound } from 'next/navigation';
import { areQaFixturesAllowed } from '@/lib/qa/gate';

/**
 * DEV visual fixture only — not E2E certification.
 * No personal data. Blocked in production unless ALLOW_PUBLIC_QA=1.
 */
export default function QaTestModeCreatePage() {
  if (!areQaFixturesAllowed()) notFound();

  return (
    <main className="min-h-screen bg-stone-100 p-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-stone-900">Crea campagna</h2>
        <p className="mt-1 text-sm text-stone-500">3 lead selezionati · preparazione automatica</p>

        <label className="mt-5 block text-sm font-medium text-stone-700">
          Nome campagna
          <input
            readOnly
            value="Campagna TEST certificazione"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-stone-700">Modalità invio</legend>
          <div className="mt-2 flex gap-4 text-sm text-stone-700">
            <label className="flex items-center gap-2">
              <input type="radio" readOnly checked={false} />
              Produzione
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" readOnly checked />
              Test
            </label>
          </div>
        </fieldset>

        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <p className="text-xs font-semibold text-violet-900">
            🧪 CAMPAGNA TEST — Nessun prospect reale verrà contattato.
          </p>
          <label className="mt-2 block text-sm font-medium text-stone-700">
            Email destinatario test
            <input
              readOnly
              value="test@example.com"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-stone-600">
            Annulla
          </button>
          <button
            type="button"
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          >
            Crea campagna
          </button>
        </div>
      </div>
    </main>
  );
}
