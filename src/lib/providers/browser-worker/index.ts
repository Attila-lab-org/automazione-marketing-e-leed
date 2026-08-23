/**
 * Factory BrowserWorkerProvider — selezione via env BROWSER_WORKER_PROVIDER_MODE
 * (mock|live), default mock (§22.3). Il provider live iniziale è Kimi
 * Work/WebBridge (§14); fallback Playwright è backlog §25.
 */

import { BrowserWorkerLive } from './live';
import { BrowserWorkerMock } from './mock';
import type { BrowserWorkerProvider } from './types';

export type { BrowserWorkerProvider, ScreenshotCapture, Viewport } from './types';
export { VIEWPORTS, VIEWPORT_SIZES } from './types';
export { BrowserWorkerMock } from './mock';
export { BrowserWorkerLive } from './live';

export function getBrowserWorkerProvider(env: NodeJS.ProcessEnv = process.env): BrowserWorkerProvider {
  const mode = (env.BROWSER_WORKER_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live') {
    return new BrowserWorkerLive({
      endpointUrl: env.BROWSER_WORKER_ENDPOINT_URL ?? '',
      authToken: env.BROWSER_WORKER_AUTH_TOKEN ?? '',
    });
  }
  if (mode !== 'mock') {
    throw new Error(`BROWSER_WORKER_PROVIDER_MODE "${mode}" non valido: atteso mock|live`);
  }
  return new BrowserWorkerMock();
}
