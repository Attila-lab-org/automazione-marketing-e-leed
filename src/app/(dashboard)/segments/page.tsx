import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { LEAD_SUBNAV } from "@/lib/navigation";

export default function SegmentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...LEAD_SUBNAV]} />
      <PageHeader
        title="Filtri salvati"
        description="Salva combinazioni di categoria, punteggio e città per ritrovare velocemente le attività che ti interessano."
      />
      <EmptyState
        title="Nessun filtro salvato"
        description="Questa funzione non è ancora disponibile. Per ora usa i filtri presenti nella pagina Attività."
        nextAction={{
          label: "Apri la pagina Attività",
          href: "/leads",
        }}
      />
    </div>
  );
}
