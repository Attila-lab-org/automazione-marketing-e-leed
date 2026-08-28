export const LEAD_SUBNAV = [
  { href: "/leads", label: "Possibili clienti", description: "Cerca, seleziona, elimina o crea una campagna." },
  { href: "/leads?view=opportunita", label: "Consigliati", description: "Vedi i contatti più interessanti." },
] as const;

export const CAMPAIGN_SUBNAV = [
  { href: "/campaigns", label: "Campagne", description: "Prepara e controlla i gruppi di invio email." },
  { href: "/review-queue", label: "Da controllare", description: "Anteprime, email e follow-up da approvare." },
  { href: "/follow-ups", label: "Follow-up", description: "Solleciti +3/+7 giorni da preparare o approvare." },
  { href: "/demos", label: "Anteprime", description: "Siti dimostrativi creati per le attività." },
  { href: "/templates", label: "Modelli", description: "Modelli usati per le anteprime." },
] as const;

/** Solo posta email: Telegram ha la propria sezione. */
export const MAIL_SUBNAV = [
  { href: "/inbox", label: "Posta email", description: "Risposte e conversazioni email dei clienti." },
  { href: "/calendar", label: "Calendario", description: "Appuntamenti, scadenze e slot disponibili." },
] as const;

/** @deprecated usa MAIL_SUBNAV */
export const MESSAGE_SUBNAV = MAIL_SUBNAV;

export const TELEGRAM_SUBNAV = [
  { href: "/telegram", label: "Chat aperte", description: "Conversazioni Telegram da gestire." },
  { href: "/telegram?view=archived", label: "Archiviate", description: "Chat chiuse o archiviate." },
  { href: "/telegram#telegram-config", label: "Configurazione", description: "Bot, modalità e parole chiave." },
] as const;

export const SETTINGS_SUBNAV = [
  { href: "/settings", label: "Collegamenti", description: "Controlla se i servizi esterni sono configurati." },
  { href: "/settings/playbook", label: "Commercial Playbook", description: "Limiti commerciali dell’AI." },
  { href: "/automations", label: "Automazioni", description: "Controlla quali attività vengono eseguite automaticamente." },
] as const;
