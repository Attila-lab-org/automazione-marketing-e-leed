"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import DangerZoneModal from "./danger-zone-modal";

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
    label: "Dashboard",
    description: "Panoramica operativa",
    match: ["/overview"],
    icon: navIcon("M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"),
  },
  {
    href: "/leads",
    label: "Lead",
    description: "Trova lead, opportunità e filtri",
    match: ["/leads", "/segments"],
    icon: navIcon(
      "M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8c0-1.7-.9-3.2-2.3-3.8M17 8.5a2.5 2.5 0 0 1-1.5 2.3M5 19c0-1.7.9-3.2 2.3-3.8M7 8.5a2.5 2.5 0 0 0 1.5 2.3",
    ),
  },
  {
    href: "/campaigns",
    label: "Campagne",
    description: "Campagne, review, demo e template",
    match: ["/campaigns", "/review-queue", "/demos", "/templates"],
    icon: navIcon(
      "M3 11l14-6v14L3 13v-2Zm14-2a4 4 0 0 1 0 6M7 13.5V17a1.5 1.5 0 0 0 3 0v-2.5",
    ),
  },
  {
    href: "/inbox",
    label: "Messaggi",
    description: "Inbox e template email",
    match: ["/inbox"],
    icon: navIcon("M4 6h16v12H4zM4 7l8 6 8-6"),
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
    description: "Providers e automazioni",
    match: ["/settings", "/automations"],
    icon: navIcon(
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3a8 8 0 0 1-.2 1.8l2 1.6-2 3.4-2.4-1a8 8 0 0 1-1.6.9L15.4 21H8.6l-.4-2.3a8 8 0 0 1-1.6-.9l-2.4 1-2-3.4 2-1.6A8 8 0 0 1 4 12a8 8 0 0 1 .2-1.8l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 1.6-.9L8.6 3h6.8l.4 2.3a8 8 0 0 1 1.6.9l2.4-1 2 3.4-2 1.6a8 8 0 0 1 .2 1.8Z",
    ),
  },
];

const SECTION_LABELS: Record<string, string> = {
  overview: "Dashboard",
  leads: "Lead",
  segments: "Filtri",
  campaigns: "Campagne",
  "review-queue": "Review Queue",
  demos: "Demos",
  templates: "Templates",
  inbox: "Messaggi",
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
  }>({ label: "RESEND …", detail: "Caricamento runtime…", mode: "loading" });

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
            label: "RESEND MOCK",
            detail: resend.detail,
            mode: "mock",
          });
        } else if (resend.status === "ready") {
          setResendBadge({
            label: "RESEND LIVE · TEST ONLY",
            detail: resend.detail,
            mode: "live",
          });
        } else {
          setResendBadge({
            label: "RESEND ERROR",
            detail: resend.detail,
            mode: "error",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResendBadge({
            label: "RESEND UNKNOWN",
            detail: "Impossibile leggere runtime provider",
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
              Sales Automation OS
            </p>
            <p className="text-[10px] uppercase tracking-wide text-stone-400">
              Workspace demo
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
            Pipeline: Trova → Qualifica → Demo → Contatta (§3). Nessun invio
            senza policy.
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
                  Dashboard
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
              placeholder="Ricerca globale — in arrivo"
              title="Ricerca globale su lead, campagne, demo e messaggi: sarà attivata con le API (§7.1)."
              aria-label="Ricerca globale (non ancora attiva)"
              className="w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-9 pr-3 text-sm text-stone-400 placeholder:text-stone-400"
            />
          </div>

          {/* Badge Resend runtime (single source of truth) */}
          <span
            title={resendBadge.detail}
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
                ? "Stato pausa sconosciuto — fail-closed (SAFE PAUSED). Riprova dopo aver ricaricato."
                : outreachPaused
                  ? "Riattiva invii e follow-up (kill switch globale, §19.2)."
                  : "Blocca immediatamente nuovi invii e follow-up in tutto il workspace (§19.2)."
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
              ? "SAFE PAUSED · UNKNOWN"
              : outreachPaused
                ? "Riprendi outreach"
                : "Pausa tutto l'outreach"}
          </button>
        </header>

        {/* Banner kill switch / unknown */}
        {pauseState === "unknown" ? (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900"
          >
            <span className="font-semibold">SAFE PAUSED · UNKNOWN:</span>{" "}
            impossibile leggere lo stato del kill switch. UI fail-closed (backend resta
            fail-closed indipendentemente).
          </div>
        ) : outreachPaused ? (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800"
          >
            <span className="font-semibold">Outreach in pausa:</span>{" "}
            nuovi invii e follow-up sono bloccati in tutto il workspace (persistente).
            Le fasi di acquisizione restano attive.
          </div>
        ) : null}

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>

      <DangerZoneModal
        open={killSwitchOpen}
        title="Pausa tutto l'outreach"
        description="Kill switch globale (§19.2): blocca immediatamente nuovi invii e follow-up in tutto il workspace. Discovery, scoring e generazione demo non vengono toccati. Potrai riprendere in qualsiasi momento dal pulsante in alto."
        affectedCount={0}
        affectedLabel="invii programmati (stato demo: nessun job attivo)"
        confirmPhrase="PAUSA"
        confirmLabel="Pausa tutto"
        onConfirm={() => {
          void setPause(true);
          setKillSwitchOpen(false);
        }}
        onCancel={() => setKillSwitchOpen(false)}
      />
    </div>
  );
}
