import { redirect } from "next/navigation";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import TelegramControlPanel from "@/components/telegram-control-panel";
import TelegramInboxStatus from "@/components/telegram-inbox-status";
import OperatorAlerts from "@/components/operator-alerts";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { TELEGRAM_SUBNAV } from "@/lib/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function TelegramPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  if (params.view === "archived") {
    redirect("/archive?tab=telegram");
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id, {
    channel: "telegram",
    includeArchived: false,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionSubnav items={[...TELEGRAM_SUBNAV]} />
      <PageHeader
        title="Telegram"
        description="Solo chat Telegram aperte. Avvia il bot, rispondi e archivia quando hai finito."
      />

      <TelegramInboxStatus configHref="#telegram-config" />
      <OperatorAlerts channel="telegram" title="Serve te" limit={4} />

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-stone-900">Chat aperte</h2>
          <p className="text-sm text-stone-500">
            Niente email qui. Le chat archiviate sono nella sezione Archivio.
          </p>
        </div>
        <InboxClient channelScope="telegram" initialThreads={threads} />
      </section>

      <details id="telegram-config" className="scroll-mt-24 rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-stone-900">
          Configurazione bot
        </summary>
        <div className="border-t border-stone-100 p-5">
          <TelegramControlPanel />
        </div>
      </details>
    </div>
  );
}
