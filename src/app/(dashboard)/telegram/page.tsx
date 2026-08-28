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
  const archivedView = params.view === "archived";

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id, {
    channel: "telegram",
    includeArchived: archivedView,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionSubnav items={[...TELEGRAM_SUBNAV]} />
      <PageHeader
        title={archivedView ? "Chat archiviate" : "Telegram"}
        description={
          archivedView
            ? "Conversazioni chiuse. Puoi riaprirle se il cliente scrive di nuovo."
            : "Solo chat Telegram aperte. Avvia il bot, rispondi e archivia quando hai finito."
        }
      />

      {!archivedView ? (
        <>
          <TelegramInboxStatus configHref="#telegram-config" />
          <OperatorAlerts channel="telegram" title="Serve te" limit={4} />
        </>
      ) : null}

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-stone-900">
            {archivedView ? "Archivio" : "Chat aperte"}
          </h2>
          <p className="text-sm text-stone-500">
            {archivedView
              ? "Niente email qui: solo Telegram archiviati."
              : "Niente email qui. Archivia le chat chiuse per tenere pulita la lista."}
          </p>
        </div>
        <InboxClient
          channelScope="telegram"
          initialThreads={threads}
          archivedView={archivedView}
        />
      </section>

      {!archivedView ? (
        <details id="telegram-config" className="scroll-mt-24 rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-stone-900">
            Configurazione bot
          </summary>
          <div className="border-t border-stone-100 p-5">
            <TelegramControlPanel />
          </div>
        </details>
      ) : null}
    </div>
  );
}
