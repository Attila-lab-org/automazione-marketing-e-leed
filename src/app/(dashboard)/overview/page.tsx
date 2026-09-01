import PageHeader from "@/components/page-header";
import TelegramPowerControl from "@/components/telegram-power-control";
import GoogleSearchControl from "@/components/google-search-control";
import OperatorAlerts from "@/components/operator-alerts";
import DashboardStats from "@/components/dashboard-stats";
import RecentCommunicationsCard from "@/components/recent-communications-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Controllo"
        description="Da qui accendi Telegram e cerchi attività su Google. Il resto sta nelle sezioni a sinistra."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <TelegramPowerControl showChatLink />
        <GoogleSearchControl redirectToLeads />
      </section>

      <OperatorAlerts channel="all" title="Da fare ora" limit={5} />

      <section aria-label="KPI principali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">Situazione in breve</h2>
        <DashboardStats />
      </section>

      <RecentCommunicationsCard />
    </div>
  );
}
