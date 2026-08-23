import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { LEAD_SUBNAV } from "@/lib/navigation";

export default function SegmentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...LEAD_SUBNAV]} />
      <PageHeader
        title="Filtri"
        description="Segmenti salvati per categoria, score e territorio. Non è più una voce principale: resta sotto Lead."
      />
      <EmptyState
        title="Nessun segmento salvato"
        description="Un segmento nasce dai filtri della lead list (categoria, score minimo, città). Flusso corretto: Trova lead → Qualifica → Salva segmento → Crea campagna. I segmenti saranno disponibili in Phase 2."
        nextAction={{
          label: "Apri la lead list per definire un filtro",
          href: "/leads",
        }}
      />
    </div>
  );
}
