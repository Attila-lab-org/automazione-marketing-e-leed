import { redirect } from "next/navigation";
import PageHeader from "@/components/page-header";
import TelegramPowerControl from "@/components/telegram-power-control";
import TelegramControlPanel from "@/components/telegram-control-panel";
import OperatorAlerts from "@/components/operator-alerts";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
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
    redirect("/archive");
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id, {
    channel: "telegram",
    includeArchived: false,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Telegram"
        description="Accendi o spegni il bot qui sopra. Sotto trovi le chat aperte."
      />

      <TelegramPowerControl />
      <OperatorAlerts channel="telegram" title="Serve te" limit={4} />

      <section>
        <h2 className="text-base font-semibold text-stone-900">Chat aperte</h2>
        <p className="mb-3 text-sm text-stone-500">
          Le chat chiuse sono in Archivio.
        </p>
        <InboxClient channelScope="telegram" initialThreads={threads} />
      </section>

      <section id="telegram-config" className="scroll-mt-24">
        <h2 className="mb-3 text-base font-semibold text-stone-900">Impostazioni bot</h2>
        <TelegramControlPanel />
      </section>
    </div>
  );
}
