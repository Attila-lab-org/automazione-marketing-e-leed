import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import InboxClient from "@/components/inbox-client";
import ArchiveCampaignsClient from "@/components/archive-campaigns-client";
import { requireAdminSession } from "@/lib/auth/guard";
import { listInboxThreads } from "@/lib/inbound/list-inbox";
import { ARCHIVE_SUBNAV } from "@/lib/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/client";
import { ensureDefaultWorkspace } from "@/lib/workspace";

type ArchiveTab = "telegram" | "email" | "campaigns";

function resolveTab(raw?: string): ArchiveTab {
  if (raw === "email" || raw === "campaigns" || raw === "telegram") return raw;
  return "telegram";
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const tab = resolveTab(params.tab);

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  const titles: Record<ArchiveTab, { title: string; description: string }> = {
    telegram: {
      title: "Archivio · Telegram",
      description: "Chat chiuse o archiviate. Puoi riaprirle in qualsiasi momento.",
    },
    email: {
      title: "Archivio · Posta",
      description: "Conversazioni email archiviate. Riaprile se il cliente torna a scrivere.",
    },
    campaigns: {
      title: "Archivio · Campagne",
      description: "Campagne messe da parte. Puoi ripristinarle o eliminarle definitivamente dalla lista attiva.",
    },
  };

  const telegramThreads =
    tab === "telegram"
      ? await listInboxThreads(admin, workspace.id, {
          channel: "telegram",
          includeArchived: true,
        })
      : [];
  const emailThreads =
    tab === "email"
      ? await listInboxThreads(admin, workspace.id, {
          channel: "email",
          includeArchived: true,
        })
      : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionSubnav items={[...ARCHIVE_SUBNAV]} />
      <PageHeader title={titles[tab].title} description={titles[tab].description} />

      {tab === "telegram" ? (
        <InboxClient
          channelScope="telegram"
          initialThreads={telegramThreads}
          archivedView
        />
      ) : null}

      {tab === "email" ? (
        <InboxClient channelScope="email" initialThreads={emailThreads} archivedView />
      ) : null}

      {tab === "campaigns" ? <ArchiveCampaignsClient /> : null}
    </div>
  );
}
