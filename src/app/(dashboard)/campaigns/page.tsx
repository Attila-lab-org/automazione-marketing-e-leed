import CampaignsClient from "@/components/campaigns-client";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Campagne"
        description="Raggruppa più attività, prepara automaticamente anteprime e messaggi, poi controlla tutto prima dell’invio."
      />

      <CampaignsClient />
    </div>
  );
}
