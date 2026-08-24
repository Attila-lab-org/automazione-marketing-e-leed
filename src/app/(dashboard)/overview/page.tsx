import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import DashboardStats from "@/components/dashboard-stats";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Riepilogo"
        description="Qui vedi quante attività hai trovato, quante anteprime sono pronte e quali invii richiedono attenzione."
      />

      <section aria-label="KPI principali">
        <DashboardStats />
      </section>

      <section aria-label="Stato dei sistemi" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Stato dei collegamenti</h2>
        <ProvidersRuntimeList layout="grid" />
      </section>
    </div>
  );
}
