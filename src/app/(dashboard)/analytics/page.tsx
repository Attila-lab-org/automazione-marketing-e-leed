import EmptyState from "@/components/empty-state";
import KpiCard from "@/components/kpi-card";
import PageHeader from "@/components/page-header";

/**
 * Analytics (§6.1, §20): conversioni e performance del funnel.
 * Phase 1: KPI placeholder a zero sui funnel §20.
 */
export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Statistiche"
        description="Misura quante attività trovi, quante contatti e quante rispondono."
      />

      <section aria-label="Funnel discovery e qualification">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Ricerca e valutazione
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Attività trovate"
            value="0"
            tooltip="Numero di attività trovate su Google, senza contare due volte la stessa attività."
          />
          <KpiCard
            label="Opportunità valide"
            value="—"
            tooltip="Percentuale di attività che supera il punteggio minimo ed è interessante da contattare."
          />
          <KpiCard
            label="Punteggio medio"
            value="—"
            tooltip="Punteggio medio delle attività considerate buone opportunità."
          />
          <KpiCard
            label="Tempo per l’anteprima"
            value="—"
            tooltip="Tempo medio tra la ricerca di un’attività e la creazione della sua anteprima."
          />
        </div>
      </section>

      <section aria-label="Funnel outreach e risultati commerciali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Email e risultati
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Email inviate"
            value="0"
            tooltip="Numero di email realmente inviate dopo tutti i controlli di sicurezza."
            accent="amber"
          />
          <KpiCard
            label="Percentuale di risposte"
            value="—"
            tooltip="Percentuale di clienti che hanno risposto alle email ricevute."
            accent="amber"
          />
          <KpiCard
            label="Visite alle anteprime"
            value="0"
            tooltip="Numero di volte in cui sono state aperte le anteprime pubbliche."
            accent="green"
          />
          <KpiCard
            label="Clienti interessati"
            value="0"
            tooltip="Numero di attività che hanno mostrato interesse o sono diventate clienti."
            accent="green"
          />
        </div>
      </section>

      <EmptyState
        title="Nessuna metrica disponibile"
        description="Le statistiche compariranno quando inizierai a cercare attività e inviare le prime email."
        nextAction={{
          label: "Vai al riepilogo",
          href: "/overview",
        }}
      />
    </div>
  );
}
