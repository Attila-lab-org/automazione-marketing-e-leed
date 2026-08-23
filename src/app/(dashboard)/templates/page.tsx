import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import TemplatesLibrary from "./templates-library";

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Templates"
        description="Master Template in codice React. Il database tiene solo metadata e versioni. Le demo già create restano sulla loro versione."
      />
      <TemplatesLibrary />
    </div>
  );
}
