import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { MESSAGE_SUBNAV } from "@/lib/navigation";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MESSAGE_SUBNAV]} />
      <PageHeader
        title="Messaggi"
        description="Qui leggerai le risposte dei clienti. Quando un cliente risponde, i messaggi automatici successivi si fermano."
      />
      <EmptyState
        title="Nessuna conversazione"
        description="Le conversazioni compariranno quando il collegamento per ricevere le risposte email sarà attivo."
        nextAction={{
          label: "Controlla il collegamento email",
          href: "/settings",
        }}
      />
    </div>
  );
}
