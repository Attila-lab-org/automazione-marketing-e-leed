import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import LeadsBrowser from "./leads-browser";

/**
 * Leads (§6.1, §7): database lead, filtri, bulk actions, dettaglio.
 * Phase 1: tabella con dati demo locali per mostrare struttura, badge e
 * quick drawer. Nessun dato reale fino a Phase 2 (Google Places adapter).
 */
export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Leads"
        description="Il database dei lead scoperti: filtri persistenti, bulk actions, badge score/confidence e anteprima rapida senza cambiare pagina (§7.1)."
      />

      <LeadsBrowser />

      <EmptyState
        title="Questi sono dati dimostrativi"
        description="I lead reali arriveranno dalla discovery Google Places (§13): categoria + area + filtri, con deduplica automatica (§13.2). Durante l'acquisizione nessun invio è possibile (gate §3)."
        nextAction={{
          label: "Configura la discovery in Settings",
          href: "/settings",
        }}
      />
    </div>
  );
}
