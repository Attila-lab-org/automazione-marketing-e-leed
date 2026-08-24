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
        title={opportunita ? "Opportunità" : "Attività"}
        description={
          opportunita
            ? "Qui trovi le attività più interessanti. Puoi controllarle e creare un’anteprima senza inviare email."
            : "Cerca nuove attività, controlla i dati e crea un’anteprima del loro possibile sito."
        }
      />
      <LeadsBrowser view={opportunita ? "opportunita" : "tutti"} />
    </div>
  );
}
