import CampaignsClient from "@/components/campaigns-client";
import PageHeader from "@/components/page-header";

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Invii email"
        description="Apri un gruppo, aspetta che il testo sia scritto, poi invialo."
      />

      <CampaignsClient />
    </div>
  );
}
