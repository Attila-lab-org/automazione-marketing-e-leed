import PageHeader from "@/components/page-header";
import DashboardStats from "@/components/dashboard-stats";
import OperatorAlerts from "@/components/operator-alerts";
import CommercialInsightsCard from "@/components/commercial-insights-card";
import RecentCommunicationsCard from "@/components/recent-communications-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Controllo"
        description="Qui vedi soltanto cosa conta e cosa richiede la tua attenzione."
      />

      <CommercialInsightsCard />

      <OperatorAlerts channel="all" title="Da fare ora" limit={5} />

      <section aria-label="KPI principali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">Situazione in breve</h2>
        <DashboardStats />
      </section>

      <RecentCommunicationsCard />
    </div>
  );
}
