import EmptyState from "@/components/empty-state";
import MessagePreview from "@/components/message-preview";
import PageHeader from "@/components/page-header";

/**
 * Templates (§6.1, §9, §11): landing e message template con versioni.
 * Phase 1: anteprima di un message template demo con variabili risolte.
 */
export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Templates"
        description="Master template e versioni per landing demo e messaggi: l'AI personalizza i dati, mai il layout (§9). Le override del singolo lead non modificano il master (§11)."
      />

      <section aria-label="Anteprima message template" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Esempio di message template con variabili risolte
        </h2>
        <MessagePreview
          templateName="Primo contatto — Ristoranti"
          templateVersion="v1.0"
          subject="Una vetrina online per {{azienda}} — demo già pronta"
          body={`Buongiorno {{nome_contatto}},

ho visto il sito di {{azienda}} e ho notato che {{problema_principale}}. Ho preparato una demo personalizzata per mostrarle come potrebbe apparire: {{link_demo}}

Se le interessa, posso illustrargliela in 10 minuti.

Cordiali saluti,
{{firma}}`}
          demoUrl="demo.example.com/d/ristoranti-x1y2z3"
          screenshotLabel="screenshot-desktop.png"
          policyNote="MANUAL — l'invio richiede approvazione in Review Queue (§4)."
        />
      </section>

      <EmptyState
        title="Nessun template reale ancora"
        description="Il Template Engine (master + versioni, campi configurabili §9.1, editor demo §9.2) arriverà in Phase 4. Il seed iniziale prevede 2 landing template e 2 message template (§22.1)."
        nextAction={{
          label: "Torna alla Overview",
          href: "/overview",
        }}
      />
    </div>
  );
}
