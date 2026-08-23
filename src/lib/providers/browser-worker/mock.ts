/**
 * Mock BrowserWorker deterministico — nessuna chiamata di rete, nessun browser.
 *
 * L'analisi è derivata da un hash stabile dell'URL: stesso URL → stesso
 * risultato (test e demo riproducibili). Rispetta il result contract §14.1.
 */

import { stableHash } from '../google-places/mock';
import type { AuditIssue, AuditOpportunity } from '../../types/domain';
import type { WebsiteAuditResult } from '../../types/domain';
import { VIEWPORT_SIZES, type BrowserWorkerProvider, type ScreenshotCapture, type Viewport } from './types';

const ISSUE_POOL: Array<Omit<AuditIssue, 'confidence'>> = [
  { type: 'outdated_design', severity: 'HIGH', evidence: 'layout non responsive rilevato' },
  { type: 'missing_cta', severity: 'MEDIUM', evidence: 'nessuna call-to-action above the fold' },
  { type: 'slow_performance', severity: 'HIGH', evidence: 'tempo di caricamento percepito elevato' },
  { type: 'no_mobile_optimization', severity: 'CRITICAL', evidence: 'viewport meta assente' },
  { type: 'missing_ssl', severity: 'CRITICAL', evidence: 'sito servito senza HTTPS' },
  { type: 'poor_visual_quality', severity: 'MEDIUM', evidence: 'immagini stock a bassa risoluzione' },
  { type: 'missing_contact_page', severity: 'LOW', evidence: 'pagina contatti non trovata' },
];

const OPPORTUNITY_POOL: Array<Omit<AuditOpportunity, 'confidence'>> = [
  { type: 'modern_redesign', description: 'redesign moderno con CTA chiara', evidence: 'template disponibile per la categoria' },
  { type: 'mobile_first', description: 'versione mobile-first del sito', evidence: 'traffico mobile stimato >60%' },
  { type: 'lead_capture', description: 'form di contatto con CTA demo', evidence: 'nessun form presente' },
  { type: 'booking_cta', description: 'integrazione prenotazioni online', evidence: 'assenza booking' },
];

export class BrowserWorkerMock implements BrowserWorkerProvider {
  readonly analyzedBy = 'browser-worker-mock';

  async analyzeWebsite(url: string): Promise<WebsiteAuditResult> {
    const h = stableHash(url);
    const issueCount = 1 + (h % 4); // 1-4 issues deterministici
    const issues: AuditIssue[] = [];
    for (let i = 0; i < issueCount; i += 1) {
      const issue = ISSUE_POOL[(h >> (i * 3)) % ISSUE_POOL.length];
      issues.push({ ...issue, confidence: 60 + ((h >> (i * 5)) % 40) });
    }
    // dedup by type
    const seen = new Set<string>();
    const uniqueIssues = issues.filter((i) => (seen.has(i.type) ? false : (seen.add(i.type), true)));

    const oppCount = h % 3; // 0-2 opportunità
    const opportunities: AuditOpportunity[] = [];
    for (let i = 0; i < oppCount; i += 1) {
      const opp = OPPORTUNITY_POOL[(h >> (i * 4)) % OPPORTUNITY_POOL.length];
      opportunities.push({ ...opp, confidence: 55 + ((h >> (i * 6)) % 45) });
    }

    const hasViewportMeta = !uniqueIssues.some((i) => i.type === 'no_mobile_optimization');
    const usesHttps = url.startsWith('https://');

    return {
      finalUrl: url,
      redirectChain: usesHttps ? [] : [url.replace('http://', 'https://')],
      emailsFound: h % 3 === 0 ? [`info@${new URL(url).hostname}`] : [],
      phonesFound: h % 2 === 0 ? [`+39 02 ${1000000 + (h % 8999999)}`] : [],
      socialLinks: h % 4 === 0 ? ['https://facebook.com/mock-page'] : [],
      ctas: h % 5 === 0 ? [] : ['Contattaci'],
      keyPages: ['/', '/chi-siamo', ...(h % 2 === 0 ? ['/contatti'] : [])],
      mobileSignals: { responsive: hasViewportMeta, viewportMeta: hasViewportMeta },
      issues: uniqueIssues,
      opportunities,
      evidenceAssets: [`mock://evidence/${stableHash(url).toString(36)}/snapshot`],
      analyzedBy: this.analyzedBy,
    };
  }

  async captureScreenshot(url: string, viewport: Viewport): Promise<ScreenshotCapture> {
    const size = VIEWPORT_SIZES[viewport];
    return {
      viewport,
      width: size.width,
      height: size.height,
      storagePath: `mock-screenshots/${stableHash(url).toString(36)}/${viewport}.png`,
      capturedAt: new Date().toISOString(),
    };
  }
}
