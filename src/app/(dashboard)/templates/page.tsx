import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import TemplatesLibrary from "./templates-library";

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Modelli"
        description="I modelli sono la base grafica usata per creare le anteprime. Le anteprime già create non cambiano quando aggiorni un modello."
      />
      <TemplatesLibrary />
    </div>
  );
}
