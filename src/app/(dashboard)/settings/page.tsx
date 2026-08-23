import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import ProviderStatus from "@/components/provider-status";

/**
 * Settings (§6.1, §6.2): provider, domini, API, utenti, sicurezza.
 * Phase 1: checklist onboarding con stato verde/ambra/rosso (§6.2 step 10).
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Settings"
        description="Provider esterni, domini mittente, API key, utenti e sicurezza. Le configurazioni avanzate stanno dietro 'Advanced settings' (§6.2): qui solo ciò che serve per partire."
      />

      {/* Checklist onboarding (§6.2) */}
      <section aria-label="Checklist di configurazione" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Checklist di configurazione (§6.2)
        </h2>
        <div className="space-y-3">
          <ProviderStatus
            name="1 · Google Places API"
            status="not_configured"
            tooltip="Necessaria per la discovery dei lead (§13). Senza chiave il provider resta in mock mode (§22.3)."
            detail="prossimo passo: incolla la API key e verifica"
          />
          <ProviderStatus
            name="2 · Resend + dominio mittente"
            status="not_configured"
            tooltip="Necessario per l'invio email (§11.2): API key server-side, dominio verificato e webhook per bounce/reply."
            detail="prossimo passo: collega Resend e verifica il dominio"
          />
          <ProviderStatus
            name="3 · Supabase Storage"
            status="not_configured"
            tooltip="Bucket per screenshot e asset demo (§10). Verifica che il bucket esista e che le policy RLS siano attive (§16.4)."
            detail="prossimo passo: verifica bucket e RLS"
          />
          <ProviderStatus
            name="4 · Browser Worker (Kimi WebBridge)"
            status="not_configured"
            tooltip="Adapter per analisi siti e screenshot (§14). Nessuno stato essenziale vive nella sessione browser: Supabase è il system of record."
            detail="mock mode"
          />
          <ProviderStatus
            name="5 · Policy predefinita workspace"
            status="degraded"
            tooltip="Modalità predefinita per le nuove campagne (§4). Full Auto NON deve essere pre-selezionato (§6.2 step 6)."
            detail="da scegliere: Manuale o Score-Based"
            lastCheckLabel="in attesa di scelta"
          />
        </div>
      </section>

      {/* Advanced settings */}
      <details className="rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-stone-700">
          Advanced settings
          <span className="ml-2 text-xs font-normal text-stone-400">
            soglie score/confidence, rate limit, ruoli utente, domini — Phase 1
            backend
          </span>
        </summary>
        <div className="border-t border-stone-100 px-5 py-4 text-sm text-stone-500">
          Le configurazioni avanzate (soglie §5.2, rate limit e finestre orarie
          §8.1, ruoli Owner/Admin/Operator/Viewer §16.4) saranno gestite qui
          quando le API route saranno disponibili.
        </div>
      </details>

      <EmptyState
        title="Configurazione non ancora completata"
        description="Completa la checklist sopra per abilitare discovery e outreach. Finché i provider non sono configurati tutto il sistema opera in Mock Mode, senza chiamate né invii reali."
        nextAction={{
          label: "Torna alla Overview",
          href: "/overview",
        }}
      />
    </div>
  );
}
