/**
 * Adapter live Google Places — STUB Phase 1.
 *
 * La chiamata reale a Google Places API sarà implementata nella fase Lead
 * domain (§23 Phase 2). Lo stub esiste per fissare il punto di integrazione:
 * senza credenziali/config fallisce con errore chiaro, mai silenziosamente.
 */

import type { GooglePlacesProvider, DiscoveryQuery, DiscoveredPlace, PlaceEnrichment } from './types';

export interface GooglePlacesLiveConfig {
  apiKey: string;
}

export class GooglePlacesLive implements GooglePlacesProvider {
  private readonly config: GooglePlacesLiveConfig;

  constructor(config: GooglePlacesLiveConfig) {
    if (!config.apiKey) {
      throw new Error(
        'GooglePlacesLive: credenziali mancanti — configurare GOOGLE_PLACES_API_KEY oppure usare GOOGLE_PLACES_PROVIDER_MODE=mock',
      );
    }
    this.config = config;
  }

  async searchMinimal(_query: DiscoveryQuery): Promise<DiscoveredPlace[]> {
    void this.config;
    throw new Error('GooglePlacesLive.searchMinimal non implementato in Phase 1: usare mock mode');
  }

  async enrich(_placeId: string): Promise<PlaceEnrichment> {
    throw new Error('GooglePlacesLive.enrich non implementato in Phase 1: usare mock mode');
  }
}
