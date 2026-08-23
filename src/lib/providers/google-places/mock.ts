/**
 * Mock deterministica del GooglePlacesProvider — nessuna chiamata di rete.
 * Genera lead fake realistici su domini riservati (RFC 2606, §22.1/§23.1).
 */

import type { DiscoveredPlace, DiscoveryQuery, GooglePlacesProvider, PlaceEnrichment } from './types';

/** hash stabile (FNV-1a) per output deterministico dato lo stesso input. */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const CATEGORY_LABELS: Record<string, string> = {
  ristoranti: 'Ristorante',
  parrucchieri: 'Parrucchiere',
  idraulici: 'Idraulica',
  dentisti: 'Studio Dentistico',
  palestre: 'Palestra',
};

const OWNER_NAMES = ['Rossi', 'Bianchi', 'Verdi', 'Ferrari', 'Romano', 'Gallo', 'Conti', 'Esposito'];

export class GooglePlacesMock implements GooglePlacesProvider {
  async searchMinimal(query: DiscoveryQuery): Promise<DiscoveredPlace[]> {
    const max = Math.min(query.maxResults ?? 5, 20);
    const seed = stableHash(`${query.category}|${query.location}`);
    const label = CATEGORY_LABELS[query.category.trim().toLowerCase()] ?? query.category;
    const places: DiscoveredPlace[] = [];

    for (let i = 0; i < max; i += 1) {
      const h = stableHash(`${seed}|${i}`);
      const owner = OWNER_NAMES[h % OWNER_NAMES.length];
      places.push({
        googlePlaceId: `mock-place-${(seed % 1000).toString(36)}${i.toString(36)}${(h % 1296).toString(36)}`,
        name: `${label} ${owner}`,
        category: query.category,
        address: `Via Example ${1 + (h % 200)}`,
        city: query.location,
        region: 'Lombardia',
        lat: 45.4642 + ((h % 1000) - 500) / 10000,
        lng: 9.19 + (((h >> 8) % 1000) - 500) / 10000,
        businessStatus: query.businessStatus ?? 'OPERATIONAL',
      });
    }
    return places;
  }

  async enrich(placeId: string): Promise<PlaceEnrichment> {
    const h = stableHash(placeId);
    const slug = placeId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24);
    const hasWebsite = h % 5 !== 0; // ~80% dei lead ha un sito
    const hasPhone = h % 7 !== 0;
    return {
      googlePlaceId: placeId,
      websiteUrl: hasWebsite ? `https://${slug}.example.com` : null,
      phone: hasPhone ? `+39 02 ${1000000 + (h % 8999999)}` : null,
      rating: 3 + (h % 21) / 10, // 3.0 – 5.0
      reviewCount: h % 400,
      openingHours: ['Mo-Fr 09:00-18:00'],
      enrichedAt: new Date().toISOString(),
    };
  }
}
