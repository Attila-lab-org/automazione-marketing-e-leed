"use client";

import { useState } from "react";
import LeadQuickDrawer, {
  type LeadQuickDrawerLead,
} from "@/components/lead-quick-drawer";
import PolicyBadge from "@/components/policy-badge";
import ScoreBadge from "@/components/score-badge";
import SmartDataTable, {
  type SmartDataTableColumn,
} from "@/components/smart-data-table";

/**
 * Dati DEMO locali (Phase 1): servono solo a mostrare la struttura della
 * tabella e del drawer. Nessun dato reale, nessuna chiamata API — il
 * dominio Leads arriva in Phase 2 (§13, IMPLEMENTATION_MAP).
 */
const DEMO_LEADS: LeadQuickDrawerLead[] = [
  {
    id: "demo-1",
    name: "Ristorante Da Lucia",
    category: "Ristoranti",
    city: "Bologna",
    website: "ristorantedalucia.example.it",
    email: "info@ristorantedalucia.example.it",
    phone: "+39 051 000 0000",
    score: 82,
    confidence: 0.91,
    scoreBreakdown: [
      { label: "Qualità sito web", value: 35 },
      { label: "Presenza digitale", value: 88 },
      { label: "Contattabilità", value: 95 },
      { label: "Fit categoria", value: 90 },
      { label: "Potenziale commerciale", value: 78 },
    ],
    businessStatusLabel: "Qualificato",
    processingStatusLabel: "In attesa (Idle)",
    policyMode: "SCORE_BASED",
    timeline: [
      {
        id: "t1",
        timestampLabel: "12 mag, 09:14",
        type: "technical",
        title: "Lead scoperto",
        description: "Trovato via Google Places (query: ristoranti, Bologna).",
      },
      {
        id: "t2",
        timestampLabel: "12 mag, 09:20",
        type: "technical",
        title: "Analisi sito completata",
        description: "Sito datato, non responsive, nessuna prenotazione online.",
      },
      {
        id: "t3",
        timestampLabel: "12 mag, 09:21",
        type: "business",
        title: "Scoring completato",
        description: "Score 82/100 con confidence 91%: sopra soglia.",
      },
    ],
  },
  {
    id: "demo-2",
    name: "Studio Dentistico Aurora",
    category: "Dentisti",
    city: "Modena",
    website: "studiodentisticoaurora.example.it",
    email: "",
    phone: "+39 059 000 0000",
    score: 57,
    confidence: 0.62,
    businessStatusLabel: "Nuovo",
    processingStatusLabel: "Scoring in corso",
    policyMode: "MANUAL",
    timeline: [
      {
        id: "t4",
        timestampLabel: "12 mag, 10:02",
        type: "technical",
        title: "Lead scoperto",
        description: "Trovato via Google Places (query: dentisti, Modena).",
      },
    ],
  },
  {
    id: "demo-3",
    name: "Palestra IronWorks",
    category: "Palestre",
    city: "Parma",
    website: "",
    email: "info@ironworks.example.it",
    phone: "",
    score: 34,
    confidence: 0.48,
    businessStatusLabel: "Nuovo",
    processingStatusLabel: "In attesa (Idle)",
    policyMode: "FULL_AUTO",
    timeline: [],
  },
];

const COLUMNS: SmartDataTableColumn<LeadQuickDrawerLead>[] = [
  {
    key: "name",
    header: "Azienda",
    render: (lead) => (
      <div>
        <p className="font-medium text-stone-900">{lead.name}</p>
        <p className="text-xs text-stone-400">
          {lead.category} · {lead.city}
        </p>
      </div>
    ),
  },
  {
    key: "score",
    header: "Score",
    render: (lead) =>
      typeof lead.score === "number" ? (
        <ScoreBadge
          score={lead.score}
          confidence={lead.confidence ?? 0}
          breakdown={lead.scoreBreakdown}
        />
      ) : (
        "—"
      ),
  },
  {
    key: "email",
    header: "Email",
    render: (lead) =>
      lead.email ? (
        <span className="font-mono text-xs">{lead.email}</span>
      ) : (
        <span
          title="Email non ancora trovata: l'enrichment la cercherà (§13)."
          className="cursor-help text-xs text-stone-400"
        >
          Da arricchire
        </span>
      ),
  },
  {
    key: "businessStatusLabel",
    header: "Stato",
    render: (lead) => (
      <span
        title="Stato commerciale (§3.1), indipendente dallo stato di elaborazione."
        className="cursor-help rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-600"
      >
        {lead.businessStatusLabel}
      </span>
    ),
  },
  {
    key: "policy",
    header: "Policy",
    render: (lead) =>
      lead.policyMode ? <PolicyBadge mode={lead.policyMode} size="sm" /> : "—",
  },
];

export default function LeadsBrowser() {
  const [selectedLead, setSelectedLead] = useState<LeadQuickDrawerLead | null>(
    null,
  );

  return (
    <>
      <SmartDataTable
        columns={COLUMNS}
        rows={DEMO_LEADS}
        rowKey={(lead) => lead.id}
        searchText={(lead) =>
          `${lead.name} ${lead.category} ${lead.city} ${lead.website ?? ""} ${lead.email ?? ""} ${lead.phone ?? ""}`
        }
        onRowClick={(lead) => setSelectedLead(lead)}
        bulkActions={[
          {
            label: "Aggiungi a segmento",
            onApply: () =>
              window.alert(
                "Azione demo: i segmenti saranno disponibili in Phase 2 (§5.3).",
              ),
          },
          {
            label: "Pausa lead",
            variant: "danger",
            onApply: (rows) =>
              window.alert(
                `Azione demo: ${rows.length} lead verrebbero messi in pausa (§19.2).`,
              ),
          },
        ]}
      />
      <LeadQuickDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </>
  );
}
