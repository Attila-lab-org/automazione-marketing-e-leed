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
        description="Slot disponibili, appuntamenti con i clienti, scadenze lavoro e promemoria operativi."
      />
      <CalendarClient />
    </div>
  );
}
