import PageHeader from "@/components/page-header";
import LeadsBrowser from "./leads-browser";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; citta?: string }>;
}) {
  const { view, citta } = await searchParams;
  const opportunita = view === "opportunita";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={opportunita ? "Contatti consigliati" : "Contatti"}
        description={
          opportunita
            ? "I contatti più interessanti, pronti per un invio email."
            : "Cerca la città. Poi spunta chi ha l’email."
        }
      />
      <LeadsBrowser view={opportunita ? "opportunita" : "tutti"} initialCity={citta ?? ""} />
    </div>
  );
}
