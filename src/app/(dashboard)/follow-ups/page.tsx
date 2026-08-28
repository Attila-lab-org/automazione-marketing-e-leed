import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import FollowUpsClient from "@/components/follow-ups-client";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";

export default function FollowUpsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Follow-up"
        description="Solleciti personalizzati a +3 e +7 giorni. Nessun invio automatico: prepari la bozza e la approvi tu."
      />
      <FollowUpsClient />
    </div>
  );
}
