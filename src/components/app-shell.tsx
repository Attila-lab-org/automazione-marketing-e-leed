"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import DangerZoneModal from "./danger-zone-modal";
import AttilaAiDrawer from "./attila-ai-drawer";

/* ── Navigazione principale (§6.1) ─────────────────────────────────────── */


function navIcon(path: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  hint: string;
  description: string;
  icon: ReactNode;
  match: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principale",
    items: [
      {
        href: "/overview",
        label: "Oggi",
        hint: "",
        description: "Vedi cosa richiede attenzione e lo stato delle automazioni.",
        match: ["/overview"],
        icon: navIcon("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"),
      },
      {
        href: "/leads",
        label: "Contatti",
        hint: "",
        description: "Tutti i contatti trovati da Google, Telegram o aggiunti a mano.",
        match: ["/leads", "/segments"],
        icon: navIcon(
          "M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8c0-1.7-.9-3.2-2.3-3.8M17 8.5a2.5 2.5 0 0 1-1.5 2.3M5 19c0-1.7.9-3.2 2.3-3.8M7 8.5a2.5 2.5 0 0 0 1.5 2.3",
        ),
      },
      {
        href: "/security",
        label: "Sicurezza",
        hint: "",
        description: "Apri la pagina pubblica dei contatti e leggi un report con prove.",
        match: ["/security"],
        icon: navIcon(
          "M12 3l7 4v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V7l7-4Z",
        ),
      },
      {
        href: "/inbox",
        label: "Messaggi",
        hint: "",
        description: "Email e Telegram da leggere, rispondere o lasciare ad Attila.",
        match: ["/inbox", "/telegram"],
        icon: navIcon("M4 6h16v12H4zM4 7l8 6 8-6"),
      },
      {
        href: "/campaigns",
        label: "Invii email",
        hint: "",
        description: "Prepara e controlla gruppi di email e solleciti.",
        match: ["/campaigns", "/review-queue", "/follow-ups", "/demos", "/templates"],
        icon: navIcon(
          "M3 11l14-6v14L3 13v-2Zm14-2a4 4 0 0 1 0 6M7 13.5V17a1.5 1.5 0 0 0 3 0v-2.5",
        ),
      },
      {
        href: "/calendar",
        label: "Calendario",
        hint: "",
        description: "Appuntamenti e disponibilità.",
        match: ["/calendar"],
        icon: navIcon("M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3v3H8v-3Z"),
      },
      {
        href: "/archive",
        label: "Archivio",
        hint: "",
        description: "Chat e campagne archiviate.",
        match: ["/archive"],
        icon: navIcon("M4 7h16v2H4V7Zm2 4h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9Zm3-6h6l1 2H8l1-2Z"),
      },
    ],
  },
];

const SECTION_LABELS: Record<string, string> = {
  overview: "Oggi",
  leads: "Contatti",
  security: "Sicurezza",
  segments: "Filtri salvati",
  campaigns: "Invii email",
  telegram: "Bot Telegram",
  "review-queue": "Da approvare",
  demos: "Anteprime",
  templates: "Modelli",
  inbox: "Messaggi",
  archive: "Archivio",
  "follow-ups": "Follow-up",
  calendar: "Calendario",
  automations: "Automazioni",
  analytics: "Statistiche",
  settings: "Impostazioni",
};

/* ── AppShell ──────────────────────────────────────────────────────────── */

/**
 * AppShell — §21 inventory.
 * Sidebar con 6 macrosezioni commerciali. Route tecniche restano
 * raggiungibili come sottosezioni. Topbar con breadcrumbs + global search,
 * badge ambiente "MOCK MODE" e kill switch "PAUSA TUTTO L'OUTREACH"
 * sempre raggiungibile (§19.2). Stato persistito via workspace_feature_flags.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outreachPaused, setOutreachPaused] = useState(false);
  const [pauseState, setPauseState] = useState<"ok" | "unknown">("unknown");
  const [killSwitchOpen, setKillSwitchOpen] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(true);
  const [resendBadge, setResendBadge] = useState<{
    label: string;
    detail: string;
    mode: string;
  }>({ label: "EMAIL: CONTROLLO…", detail: "Controllo del servizio email in corso.", mode: "loading" });

  const refreshPause = useCallback(() => {
    fetch("/api/settings/outreach-pause")
      .then((r) => {
        if (!r.ok) throw new Error("pause status failed");
        return r.json();
      })
      .then((data) => {
        setOutreachPaused(Boolean(data.paused));
        setPauseState("ok");
      })
      .catch(() => {
        // Fail-closed visual: never pretend outreach is active when read fails
        setPauseState("unknown");
        setOutreachPaused(true);
      })
      .finally(() => setPauseLoading(false));
  }, []);

  useEffect(() => {
    refreshPause();
  }, [refreshPause]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const resend = (data.providers as Array<{ id: string; status: string; detail: string }>)?.find(
          (p) => p.id === "resend",
        );
        if (!resend) return;
        if (resend.status === "mock") {
          setResendBadge({
            label: "EMAIL DI PROVA",
            detail: resend.detail,
            mode: "mock",
          });
        } else if (resend.status === "ready") {
          setResendBadge({
            label: "EMAIL ATTIVE",
            detail: resend.detail,
            mode: "live",
          });
        } else {
          setResendBadge({
            label: "ERRORE EMAIL",
            detail: resend.detail,
            mode: "error",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResendBadge({
            label: "STATO EMAIL SCONOSCIUTO",
            detail: "Non è stato possibile controllare il servizio email.",
            mode: "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setPause(paused: boolean) {
    await fetch("/api/settings/outreach-pause", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    });
    refreshPause();
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs =
    pathname === "/overview"
      ? []
      : segments.map((segment, index) => ({
          label: SECTION_LABELS[segment] ?? segment,
          href: "/" + segments.slice(0, index + 1).join("/"),
          current: index === segments.length - 1,
        }));

  return (
    <div className="flex min-h-screen flex-1 bg-stone-50">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Chiudi menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-stone-950/35 lg:hidden"
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white transition-transform lg:sticky lg:top-0 lg:z-auto lg:w-60 lg:translate-x-0 ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-stone-100 px-4">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white"
          >
            S
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-stone-900">
              Gestione contatti
            </p>
            <p className="text-[10px] uppercase tracking-wide text-stone-400">
              Pannello operativo
            </p>
          </div>
        </div>

        <nav aria-label="Navigazione principale" className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.match.some((prefix) => pathname.startsWith(prefix));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        title={item.description}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          active
                            ? "bg-amber-50 font-semibold text-stone-900 shadow-[inset_2px_0_0_0_theme(colors.amber.500)]"
                            : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                        }`}
                      >
                        <span className={active ? "text-amber-600" : "text-stone-400"}>
                          {item.icon}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block text-sm">{item.label}</span>
                          {item.hint ? (
                            <span className="block text-[11px] font-normal text-stone-400">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-100 p-2">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="block rounded-lg px-3 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800"
          >
            Impostazioni
          </Link>
        </div>
      </aside>

      {/* Colonna principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-stone-200 bg-white px-3 py-2 sm:px-6">
          <button
            type="button"
            aria-label="Apri menu"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg border border-stone-200 p-2 text-stone-700 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-sm">
              <li>
                <Link href="/overview" className="text-stone-400 transition-colors hover:text-stone-600">
                  Oggi
                </Link>
              </li>
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  <span aria-hidden className="text-stone-300">
                    /
                  </span>
                  {crumb.current ? (
                    <span
                      aria-current="page"
                      className="truncate font-medium text-stone-800"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-stone-400 transition-colors hover:text-stone-600"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          {/* Badge Resend runtime (single source of truth) */}
          <span
            title={
              resendBadge.mode === "live"
                ? "Il servizio email è collegato. Per sicurezza, al momento può inviare soltanto agli indirizzi autorizzati per le prove."
                : resendBadge.mode === "mock"
                  ? "Il servizio email è in modalità prova: nessuna email reale viene inviata."
                  : "Non è stato possibile verificare il servizio email."
            }
            className={`ml-auto hidden cursor-help whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide sm:inline-flex ${
              resendBadge.mode === "live"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : resendBadge.mode === "mock"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-stone-300 bg-stone-100 text-stone-700"
            }`}
          >
            {resendBadge.label}
          </span>

          {/* Kill switch globale (§19.2) */}
          <button
            type="button"
            disabled={pauseLoading || pauseState === "unknown"}
            onClick={() =>
              outreachPaused ? void setPause(false) : setKillSwitchOpen(true)
            }
            title={
              pauseState === "unknown"
                ? "Non riesco a leggere lo stato degli invii. Per sicurezza, ogni nuovo invio è bloccato. Ricarica la pagina."
                : outreachPaused
                  ? "Riattiva le nuove email e i messaggi successivi."
                  : "Blocca subito tutte le nuove email e i messaggi successivi."
            }
            className={`max-w-40 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase leading-tight tracking-wide transition-colors sm:max-w-none sm:whitespace-nowrap sm:px-3.5 sm:text-xs ${
              pauseState === "unknown"
                ? "bg-stone-500 text-white"
                : outreachPaused
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {pauseState === "unknown"
              ? "INVII BLOCCATI · STATO NON DISPONIBILE"
              : outreachPaused
                ? "Riattiva gli invii"
                : "Blocca tutti gli invii"}
          </button>
        </header>

        {/* Banner kill switch / unknown */}
        {pauseState === "unknown" ? (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900"
          >
            <span className="font-semibold">Invii bloccati per sicurezza:</span>{" "}
            non è stato possibile leggere lo stato del sistema. Ricarica la pagina prima di procedere.
          </div>
        ) : outreachPaused ? (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800"
          >
            <span className="font-semibold">Invii in pausa:</span>{" "}
            le nuove email e i messaggi successivi sono bloccati. La ricerca delle attività resta attiva.
          </div>
        ) : null}

        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>

      <DangerZoneModal
        open={killSwitchOpen}
        title="Blocca tutti gli invii"
        description="Blocca subito le nuove email e i messaggi successivi. La ricerca, la valutazione delle attività e la creazione delle anteprime continuano a funzionare. Potrai riattivare gli invii dal pulsante in alto."
        affectedCount={0}
        affectedLabel="invii programmati"
        confirmPhrase="PAUSA"
        confirmLabel="Blocca gli invii"
        onConfirm={() => {
          void setPause(true);
          setKillSwitchOpen(false);
        }}
        onCancel={() => setKillSwitchOpen(false)}
      />
      <Suspense fallback={null}>
        <AttilaAiDrawer />
      </Suspense>
    </div>
  );
}
