import EmptyState from "@/components/empty-state";
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
        description="Le campagne restano manuali. Outreach, Resend e follow-up non sono attivi in questo slice."
      />

      {/* Legenda policy (§4) */}
      <section
        aria-label="Modalità operative"
        className="rounded-xl border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-stone-800">
          Modalità operative disponibili (§4)
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Ogni campagna sceglie quanta automazione applicare all&rsquo;invio.
          Full Auto richiede sempre conferma esplicita all&rsquo;attivazione
          (§8.1).
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="MANUAL" />
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Demo e messaggi generati automaticamente, ma ogni invio richiede
              approvazione in Review Queue. Ideale per campagne nuove.
            </p>
          </li>
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="SCORE_BASED" />
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              I gate si aprono solo sopra le soglie di score/confidence; la
              fascia intermedia va in Review Queue. Modalità standard
              consigliata.
            </p>
          </li>
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="FULL_AUTO" />
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Pipeline completa senza blocchi manuali, sempre con preview, rate
              limit, Send Guard, suppression e kill switch. Solo per segmenti
              già validati.
            </p>
          </li>
        </ul>
      </section>

      <EmptyState
        title="Nessuna campagna ancora"
        description="Il wizard di creazione (§8.1: segmento → template → sequence → policy → simulazione effetti → conferma) sarà disponibile dopo il Template Engine. Prima serve almeno un segmento salvato."
        nextAction={{
          label: "Parti dai segmenti",
          href: "/segments",
        }}
      />
    </div>
  );
}
