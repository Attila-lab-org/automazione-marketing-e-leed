import EmptyState from "@/components/empty-state";
import KpiCard from "@/components/kpi-card";
import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";

/**
 * Overview (§6.1): KPI + stato provider runtime.
 */
export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Dashboard"
        description="Punto di partenza: lead, opportunità e stato sistemi. Nessuna email parte da qui."
      />

      <section aria-label="KPI principali">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Lead totali"
            value="—"
            tooltip="Apri Leads per i conteggi reali da Supabase dopo la discovery."
            drilldownHref="/leads"
          />
          <KpiCard
            label="Lead qualificati"
            value="0"
            tooltip="Scoring non incluso in Slice 1."
            drilldownHref="/segments"
            accent="amber"
          />
          <KpiCard
            label="Demo generate"
            value="0"
            tooltip="Template/demo non inclusi in Slice 1."
            drilldownHref="/demos"
            accent="green"
          />
          <KpiCard
            label="Messaggi inviati"
            value="0"
            tooltip="Resend resta in mock: nessun invio reale."
            drilldownHref="/analytics"
            accent="red"
          />
        </div>
      </section>

      <section aria-label="Stato dei sistemi" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Stato sistemi e provider
        </h2>
        <ProvidersRuntimeList layout="grid" />
      </section>

      <section aria-label="Attività recenti" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Attività recenti
        </h2>
        <EmptyState
          title="Certifica la discovery"
          description="Vai su Leads → Trova lead → Ristoranti → Milano → 5. I lead reali devono comparire in tabella e in Supabase, senza duplicati al secondo run."
          nextAction={{
            label: "Apri Leads",
            href: "/leads",
          }}
        />
      </section>
    </div>
  );
}
