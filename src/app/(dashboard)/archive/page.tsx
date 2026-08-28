import PageHeader from "@/components/page-header";
import ArchiveThreadsClient from "@/components/archive-threads-client";
import ArchiveCampaignsClient from "@/components/archive-campaigns-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export default async function ArchivePage() {
  await requireAdminSession();
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const [telegramThreads, emailThreads] = await Promise.all([
    listInboxThreads(admin, workspace.id, {
      channel: "telegram",
      includeArchived: true,
    }),
    listInboxThreads(admin, workspace.id, {
      channel: "email",
      includeArchived: true,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Archivio"
        description="Tutto ciò che hai archiviato è qui, in un’unica pagina."
      />

      <ArchiveThreadsClient
        telegramThreads={telegramThreads}
        emailThreads={emailThreads}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Campagne archiviate</h2>
          <p className="text-sm text-stone-500">
            Ripristina una campagna per ritrovarla nella sezione Campagne.
          </p>
        </div>
        <ArchiveCampaignsClient />
      </section>
    </div>
  );
}
