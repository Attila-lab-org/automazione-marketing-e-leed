"use client";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";
import SectionSubnav from "@/components/section-subnav";
import AiFoundationPanel from "@/components/ai-foundation-panel";
import TelegramControlPanel from "@/components/telegram-control-panel";
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

      <AiFoundationPanel />

      <TelegramControlPanel />

      <EmptyState
        title="Invio di prova sicuro"
        description="Le campagne di prova possono inviare email reali soltanto agli indirizzi autorizzati. I clienti veri non vengono contattati."
        nextAction={{
          label: "Vai alle attività",
          href: "/leads",
        }}
      />
    </div>
  );
}
