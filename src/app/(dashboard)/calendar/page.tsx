import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import CalendarClient from "@/components/calendar-client";
import { MESSAGE_SUBNAV } from "@/lib/navigation";

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MESSAGE_SUBNAV]} />
      <PageHeader
        title="Calendario"
        description="Vedi gli appuntamenti della settimana, apri la conversazione collegata e aggiungi solo ciò che serve."
      />
      <CalendarClient />
    </div>
  );
}
