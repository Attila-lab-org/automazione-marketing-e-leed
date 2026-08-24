import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import DemoEditor from "./demo-editor";

export default async function DemoEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-2">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Modifica anteprima"
        description="Modifica testi, colori, immagini e contatti di questa anteprima. Le modifiche valgono soltanto per questa attività."
      />
      <DemoEditor demoId={id} />
    </div>
  );
}
