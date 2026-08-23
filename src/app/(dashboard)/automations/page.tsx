import DecisionTrace from "@/components/decision-trace";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import PolicyBadge from "@/components/policy-badge";
import SectionSubnav from "@/components/section-subnav";
import { SETTINGS_SUBNAV } from "@/lib/navigation";

/**
 * Automations (§6.1): policy, follow-up, job status.
 * Phase 1: legenda kill switch e Decision Trace dimostrativo.
 */
export default function AutomationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionSubnav items={[...SETTINGS_SUBNAV]} />
      <PageHeader
        title="Automazioni"
        description="Policy operative (§4.1), follow-up sequence (§12.2) e stato dei job persistenti della coda (§15.1): qui controlli cosa il sistema fa in automatico."
        actions={<PolicyBadge mode="SCORE_BASED" />}
      />

      {/* Kill switches (§19.2) */}
      <section
        aria-label="Kill switch disponibili"
        className="rounded-xl border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-stone-800">
          Kill switch (§19.2)
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Ogni interruttore ferma un perimetro preciso. Il kill switch globale
          è sempre raggiungibile dal pulsante rosso nella topbar.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              name: "Pausa tutto l'outreach",
              effect: "Blocca immediatamente nuovi invii e follow-up.",
              where: "Topbar — sempre visibile",
            },
            {
              name: "Pausa campagna",
              effect: "Blocca solo la campagna selezionata.",
              where: "Pagina campagna (Phase 5)",
            },
            {
              name: "Pausa discovery",
              effect: "Ferma nuovi job Google Places.",
              where: "Qui (Phase 2)",
            },
            {
              name: "Pausa browser worker",
              effect: "Ferma analisi siti e screenshot.",
              where: "Qui (Phase 4)",
            },
            {
              name: "Disabilita provider",
              effect: "Impedisce nuove chiamate al provider selezionato.",
              where: "Settings (Phase 1 backend)",
            },
          ].map((item) => (
            <li
              key={item.name}
              className="rounded-lg border border-stone-100 bg-stone-50 p-4"
            >
              <p className="text-sm font-medium text-stone-800">{item.name}</p>
              <p className="mt-1 text-xs text-stone-500">{item.effect}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-stone-400">
                {item.where}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Decision Trace dimostrativo (§19.1) */}
      <DecisionTrace
        summary="Esempio demo: come il sistema deciderebbe l'invio per un lead sopra soglia in modalità Score-Based."
        policyVersion="ws-default@v3"
        steps={[
          {
            id: "d1",
            timestampLabel: "12 mag, 09:21",
            actor: "system",
            decision: "Scoring completato",
            reason:
              "Score 82/100, confidence 91%: entrambe le dimensioni calcolate dalle evidenze dell'audit (§5.1).",
          },
          {
            id: "d2",
            timestampLabel: "12 mag, 09:22",
            actor: "policy",
            decision: "Generazione demo autorizzata",
            reason:
              "Policy SCORE_BASED: score 82 ≥ soglia 70 e confidence 0,91 ≥ 0,75 → gate aperto (§5.2).",
          },
          {
            id: "d3",
            timestampLabel: "12 mag, 09:31",
            actor: "policy",
            decision: "Invio NON autorizzato",
            reason:
              "Send policy = manual per questa campagna: la bozza va in Review Queue per approvazione umana (§8.2).",
          },
        ]}
      />

      <EmptyState
        title="Nessun job attivo"
        description="La coda persistente (job idempotenti con lease atomici, retry e dependency graph, §15.1) sarà visibile qui quando i worker partiranno. Ogni job salverà lo snapshot della policy applicata (§4.1)."
        nextAction={{
          label: "Verifica i provider in Settings",
          href: "/settings",
        }}
      />
    </div>
  );
}
