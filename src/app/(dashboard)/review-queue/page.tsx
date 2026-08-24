import PageHeader from "@/components/page-header";
import ReviewQueueClient from "@/components/review-queue-client";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";

export default function ReviewQueuePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Review Queue"
        description="Valida lead reali da campagne: demo, anteprima email, segnali Send Guard e azioni bulk."
      />
      <ReviewQueueClient />
    </div>
  );
}
