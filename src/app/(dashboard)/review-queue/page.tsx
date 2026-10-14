import PageHeader from "@/components/page-header";
import ReviewQueueClient from "@/components/review-queue-client";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ citta?: string }>;
}) {
  const { citta } = await searchParams;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Email da inviare"
        description="Leggi il testo. Se va bene, premi Invia. Finché c’è scritto che la sto ancora scrivendo, non parte niente."
      />
      <ReviewQueueClient initialCity={citta ?? null} />
    </div>
  );
}
