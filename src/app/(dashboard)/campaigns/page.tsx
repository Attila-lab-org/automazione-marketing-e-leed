import CampaignsClient from "@/components/campaigns-client";
import PageHeader from "@/components/page-header";
import PolicyBadge from "@/components/policy-badge";
import SectionSubnav from "@/components/section-subnav";
import { CAMPAIGN_SUBNAV } from "@/lib/navigation";

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionSubnav items={[...CAMPAIGN_SUBNAV]} />
      <PageHeader
        title="Campagne"
        description="Raggruppa più attività, prepara automaticamente anteprime e messaggi, poi controlla tutto prima dell’invio."
      />

      <section
        aria-label="Livelli di controllo"
        title="Queste opzioni stabiliscono quanto controllo manuale vuoi mantenere prima dell'invio."
        className="rounded-xl border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-stone-800">Livelli di controllo</h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <li title="Ogni attività e ogni messaggio devono essere approvati da te." className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="MANUAL" />
            <p className="mt-2 text-xs text-stone-500">Controlli e approvi tutto prima dell&apos;invio.</p>
          </li>
          <li title="Il sistema propone automaticamente le attività che superano i punteggi minimi." className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="SCORE_BASED" />
            <p className="mt-2 text-xs text-stone-500">Il sistema sceglie in base alla qualità dei dati.</p>
          </li>
          <li title="Modalità automatica avanzata. I controlli di sicurezza restano sempre attivi." className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="FULL_AUTO" />
            <p className="mt-2 text-xs text-stone-500">Automatica, ma sempre protetta dai controlli di sicurezza.</p>
          </li>
        </ul>
      </section>

      <CampaignsClient />
    </div>
  );
}
