export const LEAD_SUBNAV = [
  { href: "/leads", label: "Possibili clienti", description: "Cerca, seleziona, elimina o crea una campagna." },
  { href: "/leads?view=opportunita", label: "Consigliati", description: "Vedi i contatti più interessanti." },
] as const;

export const CAMPAIGN_SUBNAV = [
  { href: "/campaigns", label: "Campagne", description: "Prepara e controlla gruppi di invii." },
  { href: "/review-queue", label: "Da controllare", description: "Controlla demo e messaggi prima dell'invio." },
  { href: "/demos", label: "Anteprime", description: "Vedi i siti dimostrativi creati per le attività." },
  { href: "/templates", label: "Modelli", description: "Vedi i modelli usati per creare le anteprime." },
] as const;

export const MESSAGE_SUBNAV = [
  { href: "/inbox", label: "Conversazioni", description: "Email e Telegram, raggruppati per cliente." },
  { href: "/telegram", label: "Configura Telegram", description: "Collega o controlla il bot Telegram." },
  { href: "/calendar", label: "Calendario", description: "Appuntamenti, scadenze e slot disponibili." },
] as const;

export const SETTINGS_SUBNAV = [
  { href: "/settings", label: "Collegamenti", description: "Controlla se i servizi esterni sono configurati." },
  { href: "/settings/playbook", label: "Commercial Playbook", description: "Limiti commerciali dell’AI." },
  { href: "/automations", label: "Automazioni", description: "Controlla quali attività vengono eseguite automaticamente." },
] as const;
