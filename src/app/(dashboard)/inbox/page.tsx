import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";

/**
 * Inbox (§6.1, §12.1): reply e conversazioni.
 */
export default function InboxPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Inbox"
        description="Le risposte dei lead e le conversazioni: una reply ferma automaticamente i follow-up pendenti su quel lead (cancellazione atomica, §12.2)."
      />
      <EmptyState
        title="Nessuna conversazione"
        description="L'Inbox si popola quando arrivano risposte via webhook Resend (§11.2, §12.1). Ogni reply aggiorna lo stato commerciale del lead e sospende i follow-up pianificati."
        nextAction={{
          label: "Collega Resend e il webhook in Settings",
          href: "/settings",
        }}
      />
    </div>
  );
}
