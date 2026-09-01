import CampaignsClient from "@/components/campaigns-client";
import PageHeader from "@/components/page-header";

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Invii email"
        description="Prepara, controlla e segui le email inviate ai contatti."
      />

      <CampaignsClient />
    </div>
  );
}
