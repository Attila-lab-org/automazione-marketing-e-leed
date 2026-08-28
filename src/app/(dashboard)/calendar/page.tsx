import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import CalendarClient from "@/components/calendar-client";
import { MAIL_SUBNAV } from "@/lib/navigation";

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...MAIL_SUBNAV]} />
      <PageHeader
        title="Calendario"
        description="Appuntamenti e slot. Le chat restano in Posta o Telegram."
      />
      <CalendarClient />
    </div>
  );
}
