export const LEAD_SUBNAV = [
  { href: "/leads", label: "Trova attività", description: "Cerca nuove attività e aggiungile alla lista." },
  { href: "/leads?view=opportunita", label: "Opportunità", description: "Vedi le attività più interessanti da contattare." },
  { href: "/segments", label: "Filtri salvati", description: "Raggruppa le attività usando criteri ricorrenti." },
] as const;

export const CAMPAIGN_SUBNAV = [
  { href: "/campaigns", label: "Campagne", description: "Prepara e controlla gruppi di invii." },
  { href: "/review-queue", label: "Da controllare", description: "Controlla demo e messaggi prima dell'invio." },
  { href: "/demos", label: "Anteprime", description: "Vedi i siti dimostrativi creati per le attività." },
  { href: "/templates", label: "Modelli", description: "Vedi i modelli usati per creare le anteprime." },
] as const;

export const MESSAGE_SUBNAV = [
  { href: "/inbox", label: "Posta in arrivo", description: "Leggi le risposte ricevute dai potenziali clienti." },
] as const;

export const SETTINGS_SUBNAV = [
  { href: "/settings", label: "Collegamenti", description: "Controlla se i servizi esterni sono configurati." },
  { href: "/settings/playbook", label: "Commercial Playbook", description: "Limiti commerciali dell’AI." },
  { href: "/automations", label: "Automazioni", description: "Controlla quali attività vengono eseguite automaticamente." },
] as const;
