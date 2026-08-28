import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { MESSAGE_SUBNAV } from "@/lib/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function InboxPage() {
  await requireAdminSession();
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MESSAGE_SUBNAV]} />
      <PageHeader
        title="Messaggi"
        description="Tutte le conversazioni in un'unica inbox. Filtra subito per canale, risposta e urgenza."
      />
      <InboxClient initialThreads={threads} />
    </div>
  );
}
