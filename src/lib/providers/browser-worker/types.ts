/**
 * BrowserWorkerProvider — contratto §14/§14.1.
 *
 * - analyzeWebsite(url): risultato normalizzato §14.1 (URL finale + redirect
 *   chain, contatti pubblici, CTA, pagine chiave, segnali mobile, issues[] con
 *   type/severity/evidence/confidence, opportunities[], evidence assets).
 * - captureScreenshot(url, viewport): riferimento asset per Supabase Storage.
 * - Sostituibile: provider iniziale Kimi Work/WebBridge, fallback Playwright
 *   (backlog §25). Il core non dipende dalla sessione come system of record.
 */

import type { WebsiteAuditResult } from '../../types/domain';

export type { AuditIssue, AuditOpportunity, WebsiteAuditResult } from '../../types/domain';

export const VIEWPORTS = ['desktop', 'mobile'] as const;
export type Viewport = (typeof VIEWPORTS)[number];

export const VIEWPORT_SIZES: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export interface ScreenshotCapture {
  viewport: Viewport;
  width: number;
  height: number;
  /** puntatore storage (bucket/path) — upload gestito dal job, non dal provider */
  storagePath: string;
  capturedAt: string;
}

export interface BrowserWorkerProvider {
  analyzeWebsite(url: string): Promise<WebsiteAuditResult>;
  captureScreenshot(url: string, viewport: Viewport): Promise<ScreenshotCapture>;
}
