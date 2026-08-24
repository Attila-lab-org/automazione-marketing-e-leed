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
        description="Superficie operativa principale: creazione bulk, preparazione automatica demo/email e avvio sequence."
      />

      <section aria-label="Modalità operative" className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Modalità operative</h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="MANUAL" />
            <p className="mt-2 text-xs text-stone-500">Review obbligatoria prima dell&apos;invio.</p>
          </li>
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="SCORE_BASED" />
            <p className="mt-2 text-xs text-stone-500">Soglie score/confidence configurabili.</p>
          </li>
          <li className="rounded-lg border border-stone-100 bg-stone-50 p-4">
            <PolicyBadge mode="FULL_AUTO" />
            <p className="mt-2 text-xs text-stone-500">Sempre soggetta a Send Guard e kill switch.</p>
          </li>
        </ul>
      </section>

      <CampaignsClient />
    </div>
  );
}
