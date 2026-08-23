import EmptyState from "@/components/empty-state";
import KpiCard from "@/components/kpi-card";
import PageHeader from "@/components/page-header";
import ProviderStatus from "@/components/provider-status";

/**
 * Overview (§6.1): KPI, alert, pipeline, attività recenti, stato sistemi.
 * Phase 1: KPI a zero/placeholder, nessun dato reale.
 */
export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Overview"
        description="Quanti lead abbiamo, cosa richiede attenzione, cosa è in automatico e come fermare gli invii: il punto di partenza operativo della giornata (§6)."
      />

      {/* KPI — placeholder a zero (Phase 1, nessun dato reale) */}
      <section aria-label="KPI principali">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Lead totali"
            value="0"
            tooltip="Numero di lead nel database del workspace, dopo deduplica (§13.2). Si popola con la discovery Google Places (Phase 2)."
            drilldownHref="/leads"
          />
          <KpiCard
            label="Lead qualificati"
            value="0"
            tooltip="Lead con scoring completato sopra soglia (§5). La qualificazione parte con lo Score Engine (Phase 3)."
            drilldownHref="/segments"
            accent="amber"
          />
          <KpiCard
            label="Demo generate"
            value="0"
            tooltip="Landing demo personalizzate pubblicate (§9-§10). Disponibile con il Template Engine (Phase 4)."
            drilldownHref="/demos"
            accent="green"
          />
          <KpiCard
            label="Messaggi inviati"
            value="0"
            tooltip="Email effettivamente inviate tramite Resend dopo policy + Send Guard (§11.2). In Mock Mode nessun invio reale avviene."
            drilldownHref="/analytics"
            accent="red"
          />
        </div>
      </section>

      {/* Stato sistemi */}
      <section aria-label="Stato dei sistemi" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Stato sistemi e provider
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProviderStatus
            name="Google Places"
            status="not_configured"
            tooltip="Provider di discovery (§13). Verrà configurato nell'onboarding guidato (§6.2); finché la chiave manca opera in mock mode."
            detail="mock mode"
          />
          <ProviderStatus
            name="Resend"
            status="not_configured"
            tooltip="Provider email (§11.2). Richiede API key, dominio mittente e webhook verificato prima di qualsiasi invio."
            detail="mock mode"
          />
          <ProviderStatus
            name="Browser Worker"
            status="not_configured"
            tooltip="Analisi siti e screenshot via adapter WebBridge (§14). Nessun job browser è ancora stato eseguito."
            detail="mock mode"
          />
          <ProviderStatus
            name="Supabase"
            status="not_configured"
            tooltip="System of record (§16): database, storage, auth e audit. Le migrazioni arrivano con Phase 1 backend."
          />
        </div>
      </section>

      {/* Attività recenti + cosa fare ora */}
      <section aria-label="Attività recenti" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Attività recenti
        </h2>
        <EmptyState
          title="Nessuna attività registrata"
          description="Qui vedrai pipeline, alert ed eventi recenti appena colleghi i provider e lanci la prima discovery. Il flusso corretto è: Trova lead → Qualifica → Salva segmento → Crea campagna → Genera demo/messaggi → Invia secondo policy (§5.3)."
          nextAction={{
            label: "Vai ai Settings per collegare i provider",
            href: "/settings",
          }}
        />
      </section>
    </div>
  );
}
