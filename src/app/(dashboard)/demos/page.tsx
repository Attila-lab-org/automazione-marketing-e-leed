import DemoPreview from "@/components/demo-preview";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";

/**
 * Demos (§6.1, §10): istanze demo, preview, screenshot, stato.
 * Phase 1: frame di anteprima con toggle desktop/mobile su placeholder.
 */
export default function DemosPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Demos"
        description="Le landing demo personalizzate per ogni lead: preview live desktop/mobile, screenshot per l'email e URL pubblico noindex (§10). La preview esiste sempre, qualunque sia la policy (§7.3)."
      />

      <DemoPreview templateName="Template Ristoranti" templateVersion="v1.2" />

      <EmptyState
        title="Nessuna demo pubblicata"
        description="Le istanze demo nascono dal Template Engine (§9): l'AI personalizza i dati senza riscrivere layout o CSS. Gli screenshot desktop/mobile partono solo dopo la pubblicazione (§10.1)."
        nextAction={{
          label: "Vai ai template per preparare il primo layout",
          href: "/templates",
        }}
      />
    </div>
  );
}
