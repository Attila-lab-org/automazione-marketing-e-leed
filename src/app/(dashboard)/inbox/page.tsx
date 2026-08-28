import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import InboxClient from "@/components/inbox-client";
import { MESSAGE_SUBNAV } from "@/lib/navigation";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MESSAGE_SUBNAV]} />
      <PageHeader
        title="Messaggi"
        description="Tutte le conversazioni in un'unica inbox. Filtra subito per canale, risposta e urgenza."
      />
      <InboxClient />
    </div>
  );
}
