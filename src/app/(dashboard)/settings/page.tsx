"use client";

import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import SectionSubnav from "@/components/section-subnav";
import CommercialPlaybookPanel from "@/components/commercial-playbook-panel";
import { SETTINGS_SUBNAV } from "@/lib/navigation";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionSubnav items={[...SETTINGS_SUBNAV]} />
      <PageHeader
        title="Impostazioni"
        description="Controlla se database, ricerca, email, AI e contatti sono collegati e pronti all’uso."
      />

      <section aria-label="Stato dei collegamenti" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Stato dei collegamenti
        </h2>
        <ProvidersRuntimeList layout="stack" />
      </section>

      <CommercialPlaybookPanel />
    </div>
  );
}
