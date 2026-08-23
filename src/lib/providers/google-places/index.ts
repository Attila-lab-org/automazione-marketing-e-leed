/**
 * Factory GooglePlacesProvider — selezione via env GOOGLE_PLACES_PROVIDER_MODE
 * (mock|live), default mock (§22.3, §23.1: ogni adapter esterno ha mock mode).
 */

import { GooglePlacesLive } from './live';
import { GooglePlacesMock } from './mock';
import type { GooglePlacesProvider } from './types';

export type { DiscoveredPlace, DiscoveryQuery, GooglePlacesProvider, PlaceEnrichment } from './types';
export { GooglePlacesMock } from './mock';
export { GooglePlacesLive } from './live';

export function getGooglePlacesProvider(env: NodeJS.ProcessEnv = process.env): GooglePlacesProvider {
  const mode = (env.GOOGLE_PLACES_PROVIDER_MODE ?? 'mock').toLowerCase();
  if (mode === 'live') {
    return new GooglePlacesLive({ apiKey: env.GOOGLE_PLACES_API_KEY ?? '' });
  }
  if (mode !== 'mock') {
    throw new Error(`GOOGLE_PLACES_PROVIDER_MODE "${mode}" non valido: atteso mock|live`);
  }
  return new GooglePlacesMock();
}
