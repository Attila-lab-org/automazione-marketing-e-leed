import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import DemosBrowser from "./demos-browser";

export default function DemosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Demos"
        description="Istanze di un Master Template. Una demo non è un progetto né un deploy: è lead + versione template + override."
      />
      <DemosBrowser />
    </div>
  );
}
