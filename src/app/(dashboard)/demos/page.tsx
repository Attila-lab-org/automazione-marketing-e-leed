import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import DemosBrowser from "./demos-browser";

export default function DemosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Anteprime"
        description="Qui trovi i siti dimostrativi creati per ogni attività. Aprine uno per controllare o modificare testi, colori e immagini."
      />
      <DemosBrowser />
    </div>
  );
}
