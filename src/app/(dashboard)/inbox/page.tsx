import PageHeader from "@/components/page-header";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads, type InboxThreadItem } from "@/lib/inbound/list-inbox";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function InboxPage() {
  await requireAdminSession();
  let threads: InboxThreadItem[] = [];
  let initialError: string | null = null;
  try {
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    threads = await listInboxThreads(admin, workspace.id, {
      channel: "all",
      includeArchived: false,
    });
  } catch {
    initialError =
      "I messaggi non sono disponibili perché il collegamento al database non è configurato.";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Messaggi"
        description="Email e Telegram insieme. Apri una conversazione per rispondere o lasciarla ad Attila."
      />
      <InboxClient channelScope="all" initialThreads={threads} initialError={initialError} />
    </div>
  );
}
