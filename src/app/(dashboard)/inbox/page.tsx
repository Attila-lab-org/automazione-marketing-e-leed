import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import InboxClient from "@/components/inbox-client";
import TelegramInboxStatus from "@/components/telegram-inbox-status";
import { MESSAGE_SUBNAV } from "@/lib/navigation";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MESSAGE_SUBNAV]} />
      <PageHeader
        title="Conversazioni"
        description="Controlla subito ciò che richiede una tua risposta e lascia ad Attila le conversazioni sicure fino all’appuntamento."
      />
      <TelegramInboxStatus />
      <InboxClient />
    </div>
  );
}
