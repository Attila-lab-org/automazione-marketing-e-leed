/**
 * Adapter live BrowserWorker (Kimi Work/WebBridge §14) — STUB Phase 1.
 *
 * Il provider iniziale per browser automation è Kimi Work/WebBridge tramite
 * adapter; l'integrazione reale arriva con la fase Jobs + browser contract
 * (§23 Phase 5). Senza configurazione lo stub fallisce con errore chiaro.
 * Regola §14: no hidden state — il risultato ufficiale vive su Supabase.
 */

import type { WebsiteAuditResult } from '../../types/domain';
import type { BrowserWorkerProvider, ScreenshotCapture, Viewport } from './types';

export interface BrowserWorkerLiveConfig {
  endpointUrl: string;
  authToken: string;
}

export class BrowserWorkerLive implements BrowserWorkerProvider {
  private readonly config: BrowserWorkerLiveConfig;

  constructor(config: BrowserWorkerLiveConfig) {
    if (!config.endpointUrl || !config.authToken) {
      throw new Error(
        'BrowserWorkerLive: credenziali mancanti — configurare BROWSER_WORKER_ENDPOINT_URL e BROWSER_WORKER_AUTH_TOKEN oppure usare BROWSER_WORKER_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
  }

  async analyzeWebsite(_url: string): Promise<WebsiteAuditResult> {
    void this.config;
    throw new Error('BrowserWorkerLive.analyzeWebsite non implementato in Phase 1: usare mock mode');
  }

  async captureScreenshot(_url: string, _viewport: Viewport): Promise<ScreenshotCapture> {
    throw new Error('BrowserWorkerLive.captureScreenshot non implementato in Phase 1: usare mock mode');
  }
}
