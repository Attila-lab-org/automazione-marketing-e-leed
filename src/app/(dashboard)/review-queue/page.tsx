import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import ReviewCard from "@/components/review-card";

/**
 * Dati DEMO locali (Phase 1): mostrano la struttura della Review Card (§8.2).
 */
const DEMO_QUEUE = [
  {
    id: "rq-1",
    companyName: "Ristorante Da Lucia",
    category: "Ristoranti",
    city: "Bologna",
    score: 82,
    confidence: 0.91,
    subject: "Una vetrina online per Da Lucia — demo già pronta",
    messagePreview:
      "Buongiorno, ho visto che il sito di Da Lucia non permette prenotazioni online: ho preparato una demo personalizzata per mostrare come potrebbe apparire…",
    thumbnailLabel: "Template Ristoranti · v1.2",
    signals: [
      {
        label: "Email valida",
        ok: true,
        tooltip: "Indirizzo email verificato e non in suppression list (§11.2).",
      },
      {
        label: "Audit completato",
        ok: true,
        tooltip: "Analisi sito completata con evidenze e opportunità (§14.1).",
      },
      {
        label: "Template match",
        ok: true,
        tooltip: "La categoria del lead ha un template dedicato (§9).",
      },
    ],
  },
  {
    id: "rq-2",
    companyName: "Studio Dentistico Aurora",
    category: "Dentisti",
    city: "Modena",
    score: 57,
    confidence: 0.62,
    subject: "La demo del nuovo sito per Studio Aurora",
    messagePreview:
      "Gentile Studio Aurora, ho preparato una demo che mostra come i pazienti potrebbero prenotare una visita direttamente online…",
    thumbnailLabel: "Template Dentisti · v1.0",
    signals: [
      {
        label: "Email valida",
        ok: false,
        tooltip: "Email non ancora trovata: serve enrichment prima dell'invio (§13).",
      },
      {
        label: "Audit completato",
        ok: true,
        tooltip: "Analisi sito completata con evidenze e opportunità (§14.1).",
      },
      {
        label: "Template match",
        ok: true,
        tooltip: "La categoria del lead ha un template dedicato (§9).",
      },
    ],
  },
];

/**
 * Review Queue (§6.1, §8.2): approvazioni rapide di demo/messaggi/invii.
 * Phase 1: card demo locali; bulk approve arriverà con conferma esplicita
 * e conteggio record (§8.2) quando la coda sarà alimentata dal backend.
 */
export default function ReviewQueuePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Review Queue"
        description="Valida molti lead rapidamente: ogni card mostra azienda, score, thumbnail demo, oggetto e segnali chiave, con azioni Approva / Modifica / Salta / Rifiuta / Pausa (§8.2)."
      />

      <div className="space-y-4">
        {DEMO_QUEUE.map((item) => (
          <ReviewCard key={item.id} {...item} />
        ))}
      </div>

      <EmptyState
        title="Coda dimostrativa"
        description="Le card reali arriveranno dalle campagne in modalità Manuale o Score-Based (fascia intermedia, §4). Il bulk approve richiederà sempre conferma esplicita con conteggio dei record coinvolti."
        nextAction={{
          label: "Crea una campagna per alimentare la coda",
          href: "/campaigns",
        }}
      />
    </div>
  );
}
