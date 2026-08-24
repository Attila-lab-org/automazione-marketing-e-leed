import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";
import CampaignDetailClient from "./campaign-detail-client";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Dettaglio campagna"
        description="Controlla quante attività sono pronte, prepara anteprime e messaggi, poi approva gli invii."
      />
      <CampaignDetailClient campaignId={id} />
    </div>
  );
}
