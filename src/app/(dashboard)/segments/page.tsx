import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";

/**
 * Segments (§6.1, §5.3): segmenti salvati per categoria/score/territorio.
 */
export default function SegmentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Segments"
        description="Segmenti salvati per categoria, fascia di score e territorio: sono il ponte tra acquisizione e outreach — da un segmento si crea una campagna (§5.3)."
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
