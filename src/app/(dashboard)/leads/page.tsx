import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { LEAD_SUBNAV } from "@/lib/navigation";
import LeadsBrowser from "./leads-browser";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const opportunita = view === "opportunita";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...LEAD_SUBNAV]} />
      <PageHeader
        title={opportunita ? "Opportunità" : "Lead"}
        description={
          opportunita
            ? "Lead prequalificati o da analizzare. Crea una demo Restaurant Premium quando vuoi — nessuna email."
            : "Trova attività, qualifica in automatico, crea una demo a mano. Outreach resta in mock."
        }
      />
      <LeadsBrowser view={opportunita ? "opportunita" : "tutti"} />
    </div>
  );
}
