import Link from "next/link";
import PageHeader from "@/components/page-header";
import TelegramPowerControl from "@/components/telegram-power-control";
import OperatorAlerts from "@/components/operator-alerts";
import DashboardStats from "@/components/dashboard-stats";
import RecentCommunicationsCard from "@/components/recent-communications-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Oggi"
        description="Vedi cosa richiede attenzione e controlla se le automazioni sono attive."
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Azioni principali">
        <Link href="/inbox" className="rounded-xl bg-stone-900 px-4 py-4 text-white hover:bg-stone-800">
          <span className="font-semibold">Gestisci messaggi</span>
          <span className="mt-1 block text-xs text-stone-300">Email e Telegram insieme</span>
        </Link>
        <Link href="/leads" className="rounded-xl border border-stone-200 bg-white px-4 py-4 hover:border-stone-400">
          <span className="font-semibold text-stone-900">Apri contatti</span>
          <span className="mt-1 block text-xs text-stone-500">Google, bot e inserimenti manuali</span>
        </Link>
        <Link href="/campaigns" className="rounded-xl border border-stone-200 bg-white px-4 py-4 hover:border-stone-400">
          <span className="font-semibold text-stone-900">Controlla invii email</span>
          <span className="mt-1 block text-xs text-stone-500">Bozze, invii e solleciti</span>
        </Link>
      </section>

      <OperatorAlerts channel="all" title="Da fare ora" limit={5} />

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
