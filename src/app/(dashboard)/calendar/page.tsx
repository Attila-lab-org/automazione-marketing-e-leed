import PageHeader from "@/components/page-header";
import CalendarClient from "@/components/calendar-client";

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Calendario"
        description="Da lunedì a venerdì, dalle 9 alle 18, gli orari sono liberi. Si occupano solo quando c’è un appuntamento. Le conversazioni restano in Messaggi."
      />
      <CalendarClient />
    </div>
  );
}
