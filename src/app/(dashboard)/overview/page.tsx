import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import DashboardStats from "@/components/dashboard-stats";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Dashboard"
        description="Panoramica operativa con dati reali da Supabase. Outreach resta in mock finché non autorizzato."
      />

      <section aria-label="KPI principali">
        <DashboardStats />
      </section>

      <section aria-label="Stato dei sistemi" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Stato sistemi e provider</h2>
        <ProvidersRuntimeList layout="grid" />
      </section>
    </div>
  );
}
