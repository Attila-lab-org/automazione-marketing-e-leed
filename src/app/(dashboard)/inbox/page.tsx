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
        title="Comunicazioni"
        description="Un solo posto per vedere chi è stato contattato, cosa è stato inviato, le risposte e il prossimo passo."
      />
      <TelegramInboxStatus />
      <InboxClient />
    </div>
  );
}
