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
        title="Analytics"
        description="Conversioni e performance lungo tutto il funnel, con drill-down categoria → campagna → template → fascia di score (§20)."
      />

      <section aria-label="Funnel discovery e qualification">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Discovery & Qualification
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Lead scoperti"
            value="0"
            tooltip="Lead trovati via Google Places, al netto dei duplicati (§20 Discovery)."
          />
          <KpiCard
            label="Qualified rate"
            value="—"
            tooltip="Percentuale di lead che supera lo scoring sopra soglia (§20 Qualification)."
          />
          <KpiCard
            label="Score medio"
            value="—"
            tooltip="Media dello score composito sui lead qualificati (§5.1)."
          />
          <KpiCard
            label="Time-to-demo"
            value="—"
            tooltip="Tempo mediano dalla scoperta alla demo pubblicata (§20 Demo)."
          />
        </div>
      </section>

      <section aria-label="Funnel outreach e risultati commerciali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Outreach & Commerciale
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Email inviate"
            value="0"
            tooltip="Invii effettivi dopo policy + Send Guard (§11.2)."
            accent="amber"
          />
          <KpiCard
            label="Reply rate"
            value="—"
            tooltip="Risposte ricevute sul totale consegnato, al netto di bounce e unsubscribe (§20 Outreach)."
            accent="amber"
          />
          <KpiCard
            label="Visite demo"
            value="0"
            tooltip="Visite alle demo pubbliche, incluse visite ripetute (§20 Engagement)."
            accent="green"
          />
          <KpiCard
            label="Lead interessati"
            value="0"
            tooltip="Lead passati a INTERESTED o WON (§3.1, §20 Commercial)."
            accent="green"
          />
        </div>
      </section>

      <EmptyState
        title="Nessuna metrica disponibile"
        description="Le metriche si popolano con i primi job di discovery e i primi invii. In Mock Mode gli eventi email saranno simulati dal seed (§22.1) per mostrare il funnel completo."
        nextAction={{
          label: "Vai alla Overview",
          href: "/overview",
        }}
      />
    </div>
  );
}
