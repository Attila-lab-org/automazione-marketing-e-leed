import PageHeader from "@/components/page-header";
import CityBoard from "@/components/city-board";
import TelegramPowerControl from "@/components/telegram-power-control";
import DashboardStats from "@/components/dashboard-stats";
import RecentCommunicationsCard from "@/components/recent-communications-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="La campagna"
        description="Da qui scegli la città, vedi chi ha già ricevuto la mail e chi non ha risposto."
      />

      <CityBoard />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-stone-800">Bot Telegram</h2>
        <TelegramPowerControl showChatLink />
      </section>

      <section aria-label="KPI principali">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">Situazione in breve</h2>
        <DashboardStats />
      </section>

      <RecentCommunicationsCard />
    </div>
  );
}
