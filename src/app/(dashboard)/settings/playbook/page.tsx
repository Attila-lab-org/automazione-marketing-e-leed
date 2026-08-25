"use client";

import CommercialPlaybookPanel from "@/components/commercial-playbook-panel";
import PageHeader from "@/components/page-header";
import SectionSubnav from "@/components/section-subnav";
import { SETTINGS_SUBNAV } from "@/lib/navigation";

export default function PlaybookSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionSubnav items={[...SETTINGS_SUBNAV]} />
      <PageHeader
        title="Commercial Playbook"
        description="Stabilisce cosa l’AI può promettere, quando deve chiedere conferma e quando passa la conversazione a te."
      />
      <CommercialPlaybookPanel />
    </div>
  );
}
