import PageHeader from "@/components/page-header";
import CampaignDetailClient from "./campaign-detail-client";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Dettaglio invio email"
        description="Prepara i messaggi, controllali e decidi quando far partire l’invio."
      />
      <CampaignDetailClient campaignId={id} />
    </div>
  );
}
