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
        description="Controlla in un solo punto il sito dimostrativo, il messaggio email, l’offerta e le azioni proposte al cliente."
      />
      <TemplatesLibrary />
    </div>
  );
}
