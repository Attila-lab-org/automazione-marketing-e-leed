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
        title={opportunita ? "Contatti consigliati" : "Possibili clienti"}
        description={
          opportunita
            ? "Qui trovi i contatti più interessanti. Selezionali per creare una campagna."
            : "In alto cerchi su Google. Poi selezioni i contatti e crei la campagna."
        }
      />
      <LeadsBrowser view={opportunita ? "opportunita" : "tutti"} />
    </div>
  );
}
