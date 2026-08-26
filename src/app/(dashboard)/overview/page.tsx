import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import DashboardStats from "@/components/dashboard-stats";
import OperatorAlerts from "@/components/operator-alerts";
import CommercialInsightsCard from "@/components/commercial-insights-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Centro di controllo commerciale"
        description="Definisci il risultato. Attila pianifica, prepara e verifica il lavoro entro la modalità che scegli."
      />

      <CommercialInsightsCard />

      <section aria-label="KPI principali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">Numeri operativi</h2>
        <DashboardStats />
      </section>

      <OperatorAlerts />

      <section aria-label="Stato dei sistemi" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Stato dei collegamenti</h2>
        <ProvidersRuntimeList layout="grid" />
      </section>
    </div>
  );
}
