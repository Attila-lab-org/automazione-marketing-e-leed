import PageHeader from "@/components/page-header";
import CalendarClient from "@/components/calendar-client";

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Calendario"
        description="Appuntamenti e disponibilità. Le conversazioni restano in Messaggi."
      />
      <CalendarClient />
    </div>
  );
}
