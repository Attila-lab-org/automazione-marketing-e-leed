import PageHeader from "@/components/page-header";
import LeadsBrowser from "./leads-browser";

/**
 * Leads (§6.1, §7): discovery Google Places → Supabase → tabella reale.
 * Nessuna fixture dimostrativa quando Supabase è configurato.
 */
export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Leads"
        description="Discovery Google Places (Text Search New), deduplica per Place ID e persistenza Supabase. Slice 1: nessun outreach, nessuna email inventata."
      />
      <LeadsBrowser />
    </div>
  );
}
