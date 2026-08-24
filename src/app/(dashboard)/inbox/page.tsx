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
        description="Qui trovi le risposte email e i contatti nati da Telegram. I messaggi automatici restano brevi: la trattativa la gestisci tu."
      />
      <InboxClient />
    </div>
  );
}
