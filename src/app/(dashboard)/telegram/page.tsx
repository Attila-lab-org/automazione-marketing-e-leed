import PageHeader from "@/components/page-header";
import TelegramControlPanel from "@/components/telegram-control-panel";
import TelegramInboxStatus from "@/components/telegram-inbox-status";
import OperatorAlerts from "@/components/operator-alerts";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function TelegramPage() {
  await requireAdminSession();
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Telegram"
        description="Gestisci il canale Telegram, controlla le conversazioni e intervieni quando serve."
      />

      <TelegramInboxStatus />
      <OperatorAlerts />

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">Conversazioni Telegram</h2>
          <p className="text-sm text-stone-500">
            Filtra chi ha risposto, le urgenze e i casi che richiedono il tuo intervento.
          </p>
        </div>
        <InboxClient channelScope="telegram" initialThreads={threads} />
      </section>

      <details className="rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-stone-900">
          Configurazione e controllo del bot
        </summary>
        <div className="border-t border-stone-100 p-5">
          <TelegramControlPanel />
        </div>
      </details>
    </div>
  );
}
