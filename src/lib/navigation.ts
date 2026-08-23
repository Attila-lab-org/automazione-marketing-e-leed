export const LEAD_SUBNAV = [
  { href: "/leads", label: "Trova lead" },
  { href: "/leads?view=opportunita", label: "Opportunità" },
  { href: "/segments", label: "Filtri" },
] as const;

export const CAMPAIGN_SUBNAV = [
  { href: "/campaigns", label: "Campagne" },
  { href: "/review-queue", label: "Review Queue" },
  { href: "/demos", label: "Demos" },
  { href: "/templates", label: "Templates" },
] as const;

export const MESSAGE_SUBNAV = [
  { href: "/inbox", label: "Inbox" },
] as const;

export const SETTINGS_SUBNAV = [
  { href: "/settings", label: "Providers" },
  { href: "/automations", label: "Automazioni" },
] as const;
