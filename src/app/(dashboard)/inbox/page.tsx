import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import InboxClient from "@/components/inbox-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { MAIL_SUBNAV } from "@/lib/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function InboxPage() {
  await requireAdminSession();
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const threads = await listInboxThreads(admin, workspace.id, {
    channel: "email",
    includeArchived: false,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MAIL_SUBNAV]} />
      <PageHeader
        title="Posta email"
        description="Solo conversazioni email aperte. Quelle archiviate sono in Archivio."
      />
      <InboxClient channelScope="email" initialThreads={threads} />
    </div>
  );
}
