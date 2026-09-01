import PageHeader from "@/components/page-header";
import ReviewQueueClient from "@/components/review-queue-client";

export default function ReviewQueuePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Invii da approvare"
        description="Controlla le attività, le anteprime e i messaggi preparati. Da qui puoi approvare o scartare prima dell’invio."
      />
      <ReviewQueueClient />
    </div>
  );
}
