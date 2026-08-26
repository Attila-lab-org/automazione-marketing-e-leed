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
  description: string;
  icon: ReactNode;
  match: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/overview",
    label: "Controllo",
    description: "Obiettivo, priorità e stato operativo in un solo posto.",
    match: ["/overview"],
    icon: navIcon("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"),
  },
  {
    href: "/leads",
    label: "Attività",
    description: "Cerca attività e scegli quelle da contattare.",
    match: ["/leads", "/segments"],
    icon: navIcon(
      "M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8c0-1.7-.9-3.2-2.3-3.8M17 8.5a2.5 2.5 0 0 1-1.5 2.3M5 19c0-1.7.9-3.2 2.3-3.8M7 8.5a2.5 2.5 0 0 0 1.5 2.3",
    ),
  },
  {
    href: "/campaigns",
    label: "Campagne",
    description: "Prepara anteprime, controlla i messaggi e gestisci gli invii.",
    match: ["/campaigns", "/review-queue", "/demos", "/templates"],
    icon: navIcon(
      "M3 11l14-6v14L3 13v-2Zm14-2a4 4 0 0 1 0 6M7 13.5V17a1.5 1.5 0 0 0 3 0v-2.5",
    ),
  },
  {
    href: "/inbox",
    label: "Comunicazioni",
    description: "Controlla destinatari, invii, risposte e stato delle conversazioni.",
    match: ["/inbox", "/telegram"],
    icon: navIcon("M4 6h16v12H4zM4 7l8 6 8-6"),
  },
  {
    href: "/calendar",
    label: "Calendario",
    description: "Appuntamenti, scadenze e slot disponibili.",
    match: ["/calendar"],
    icon: navIcon("M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3v3H8v-3Z"),
  },
  {
    href: "/analytics",
    label: "Statistiche",
    description: "Andamento e conversioni",
    match: ["/analytics"],
    icon: navIcon("M4 20V10m6 10V4m6 16v-7m4 7H2"),
  },
  {
    href: "/settings",
    label: "Impostazioni",
    description: "Controlla collegamenti esterni e automazioni.",
    match: ["/settings", "/automations"],
    icon: navIcon(
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3a8 8 0 0 1-.2 1.8l2 1.6-2 3.4-2.4-1a8 8 0 0 1-1.6.9L15.4 21H8.6l-.4-2.3a8 8 0 0 1-1.6-.9l-2.4 1-2-3.4 2-1.6A8 8 0 0 1 4 12a8 8 0 0 1 .2-1.8l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 1.6-.9L8.6 3h6.8l.4 2.3a8 8 0 0 1 1.6.9l2.4-1 2 3.4-2 1.6a8 8 0 0 1 .2 1.8Z",
    ),
  },
];

const SECTION_LABELS: Record<string, string> = {
  overview: "Controllo",
  leads: "Attività",
  segments: "Filtri salvati",
  campaigns: "Campagne",
  telegram: "Telegram",
  "review-queue": "Da controllare",
  demos: "Anteprime",
  templates: "Modelli",
  inbox: "Comunicazioni",
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
            label: "EMAIL ATTIVE · SOLO TEST",
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
  const crumbs = segments.map((segment, index) => ({
    label: SECTION_LABELS[segment] ?? segment,
    href: "/" + segments.slice(0, index + 1).join("/"),
    current: index === segments.length - 1,
  }));

  return (
    <div className="flex min-h-screen flex-1 bg-stone-50">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
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
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.match.some((prefix) => pathname.startsWith(prefix));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.description}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-amber-50 font-semibold text-stone-900 shadow-[inset_2px_0_0_0_theme(colors.amber.500)]"
                        : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    }`}
                  >
                    <span
                      className={active ? "text-amber-600" : "text-stone-400"}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-stone-100 px-4 py-3">
          <p className="text-[11px] leading-snug text-stone-400">
            Percorso: trova un’attività → controlla i dati → crea l’anteprima →
            contatta. Nessuna email parte senza i controlli previsti.
          </p>
        </div>
      </aside>

      {/* Colonna principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-stone-200 bg-white px-6">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-sm">
              <li>
                <Link
                  href="/overview"
                  className="text-stone-400 transition-colors hover:text-stone-600"
                >
                  Riepilogo
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

          {/* Global search */}
          <div className="relative ml-auto hidden w-72 md:block">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              type="search"
              disabled
              placeholder="Ricerca generale — non ancora disponibile"
              title="In futuro permetterà di cercare attività, campagne, anteprime e messaggi da un solo punto."
              aria-label="Ricerca generale non ancora disponibile"
              className="w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-9 pr-3 text-sm text-stone-400 placeholder:text-stone-400"
            />
          </div>

          <div className="ml-auto md:ml-0">
            <Suspense fallback={null}>
              <AttilaAiDrawer />
            </Suspense>
          </div>

          {/* Badge Resend runtime (single source of truth) */}
          <span
            title={
              resendBadge.mode === "live"
                ? "Il servizio email è collegato. Per sicurezza, al momento può inviare soltanto agli indirizzi autorizzati per le prove."
                : resendBadge.mode === "mock"
                  ? "Il servizio email è in modalità prova: nessuna email reale viene inviata."
                  : "Non è stato possibile verificare il servizio email."
            }
            className={`cursor-help whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
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
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
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

        <main className="flex-1 px-6 py-6">{children}</main>
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
    </div>
  );
}
