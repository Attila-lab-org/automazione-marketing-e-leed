import PageHeader from "@/components/page-header";
import ReviewQueueClient from "@/components/review-queue-client";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";

export default function ReviewQueuePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Da controllare"
        description="Controlla le attività, le anteprime e i messaggi preparati. Da qui puoi approvare o scartare prima dell’invio."
      />
      <ReviewQueueClient />
    </div>
  );
}
