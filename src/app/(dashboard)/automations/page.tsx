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
        description="Qui controlli quali operazioni il sistema esegue da solo e quali richiedono la tua approvazione."
        actions={<PolicyBadge mode="SCORE_BASED" />}
      />

      <section
        title="Nessun secondo messaggio parte automaticamente. Sarai tu a decidere se e quando inviarlo."
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      >
        <h2 className="text-sm font-semibold text-emerald-900">
          Messaggi successivi automatici: spenti
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          Dopo la prima email non partirà altro. Deciderai tu se inviare un nuovo messaggio e
          quando farlo.
        </p>
      </section>

      {/* Kill switches (§19.2) */}
      <section
        aria-label="Comandi di arresto disponibili"
        className="rounded-xl border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-stone-800">
          Comandi di arresto
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Ogni comando ferma una parte precisa del sistema. Il blocco di tutti
          gli invii è sempre disponibile nel pulsante rosso in alto.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              name: "Blocca tutti gli invii",
              effect: "Blocca subito nuove email e messaggi successivi.",
              where: "Pulsante in alto — sempre visibile",
            },
            {
              name: "Pausa campagna",
              effect: "Blocca solo la campagna selezionata.",
              where: "Pagina della campagna",
            },
            {
              name: "Pausa ricerca attività",
              effect: "Ferma le nuove ricerche su Google.",
              where: "Questa pagina",
            },
            {
              name: "Pausa analisi siti",
              effect: "Ferma le analisi e le immagini automatiche dei siti.",
              where: "Questa pagina",
            },
            {
              name: "Disattiva un collegamento",
              effect: "Impedisce nuove richieste al servizio selezionato.",
              where: "Impostazioni",
            },
          ].map((item) => (
            <li
              key={item.name}
              title={`${item.name}: ${item.effect}`}
              tabIndex={0}
              className="rounded-lg border border-stone-100 bg-stone-50 p-4 outline-none hover:border-amber-300 focus:ring-2 focus:ring-amber-100"
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
        summary="Esempio: come il sistema decide se un’attività è pronta per ricevere un messaggio."
        policyVersion="ws-default@v3"
        steps={[
          {
            id: "d1",
            timestampLabel: "12 mag, 09:21",
            actor: "system",
            decision: "Scoring completato",
            reason:
              "Punteggio 82/100 e affidabilità dati 91%: entrambi superano i valori minimi.",
          },
          {
            id: "d2",
            timestampLabel: "12 mag, 09:22",
            actor: "policy",
            decision: "Generazione demo autorizzata",
            reason:
              "Il punteggio e l’affidabilità dei dati superano i valori minimi: l’anteprima può essere creata.",
          },
          {
            id: "d3",
            timestampLabel: "12 mag, 09:31",
            actor: "policy",
            decision: "Invio NON autorizzato",
            reason:
              "Questa campagna richiede controllo manuale: il messaggio resta tra gli elementi da controllare.",
          },
        ]}
      />

      <EmptyState
        title="Nessuna operazione automatica in corso"
        description="Quando il sistema inizierà a cercare attività, creare anteprime o preparare messaggi, potrai vedere qui lo stato di ogni operazione."
        nextAction={{
          label: "Controlla i collegamenti",
          href: "/settings",
        }}
      />
    </div>
  );
}
