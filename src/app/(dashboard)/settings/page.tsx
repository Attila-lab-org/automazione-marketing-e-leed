"use client";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import SectionSubnav from "@/components/section-subnav";
import { SETTINGS_SUBNAV } from "@/lib/navigation";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionSubnav items={[...SETTINGS_SUBNAV]} />
      <PageHeader
        title="Impostazioni"
        description="Stato provider e config commerciale owner (READY/MISSING/INVALID, senza valori/secrets). Resend MOCK oppure LIVE · TEST ONLY secondo runtime."
      />

      <section aria-label="Stato provider" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Stato provider (runtime)
        </h2>
        <ProvidersRuntimeList layout="stack" />
      </section>

      <EmptyState
        title="Safe live test"
        description="Produzione outreach resta bloccata. Campagne TEST possono usare Resend live solo verso destinatari allowlisted. Verifica APP URL + allowlist sopra."
        nextAction={{
          label: "Vai ai Leads",
          href: "/leads",
        }}
      />
    </div>
  );
}
