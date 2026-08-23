import AppShell from "@/components/app-shell";

/**
 * Layout dell'area dashboard (§6): avvolge tutte le 11 sezioni §6.1 con
 * l'AppShell (sidebar, topbar, breadcrumbs, global search, kill switch).
 * L'autenticazione Supabase sarà aggiunta qui/middleware in una fase
 * successiva (§16.4) — Phase 1 è solo shell UI.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
