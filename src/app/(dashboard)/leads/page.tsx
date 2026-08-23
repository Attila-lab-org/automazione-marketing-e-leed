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
        description="Discovery Places → Discovery Score / Confidence / stato di qualificazione. Nessuna demo, nessuna email: outreach resta in mock."
      />
      <LeadsBrowser />
    </div>
  );
}
