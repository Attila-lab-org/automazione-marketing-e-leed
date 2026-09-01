import PageHeader from "@/components/page-header";
import FollowUpsClient from "@/components/follow-ups-client";

export default function FollowUpsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Solleciti email"
        description="Solleciti personalizzati a +3 e +7 giorni. Nessun invio automatico: prepari la bozza e la approvi tu."
      />
      <FollowUpsClient />
    </div>
  );
}
