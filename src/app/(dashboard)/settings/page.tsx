"use client";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import ProvidersRuntimeList from "@/components/providers-runtime-list";

/**
 * Settings — stato provider da /api/providers/status (runtime reale).
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Settings"
        description="Stato provider derivato dal runtime (ENV + probe), non da testo statico. Slice 1: solo Supabase e Google Places possono risultare READY."
      />

      <section aria-label="Stato provider" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Stato provider (runtime)
        </h2>
        <ProvidersRuntimeList layout="stack" />
      </section>

      <EmptyState
        title="Outreach in pausa sicura"
        description="RESEND / Browser Worker / AI restano in mock. Nessuna email può partire da questo slice. Usa Leads → Trova lead per certificare Google Places → Supabase."
        nextAction={{
          label: "Vai ai Leads",
          href: "/leads",
        }}
      />
    </div>
  );
}
