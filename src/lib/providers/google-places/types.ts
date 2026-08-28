/**
 * GooglePlacesProvider — contratto §13/§13.1.
 *
 * Approccio two-step:
 *  1. searchMinimal: discovery (Text Search New) con FieldMask mirato.
 *  2. enrich: campi aggiuntivi solo sui candidati da approfondire.
 */

export interface DiscoveryQuery {
  category: string;
  /** città/area testuale (es. "Milano") */
  location: string;
  radiusMeters?: number;
  maxResults?: number;
  /** filtro business status Google (es. OPERATIONAL) */
  businessStatus?: string;
}

/** Output del discovery (Text Search New + FieldMask slice 1). */
export interface DiscoveredPlace {
  googlePlaceId: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  businessStatus: string | null;
  /** Presenti se richiesti nel FieldMask di searchText. */
  rating: number | null;
  reviewCount: number | null;
  websiteUrl: string | null;
}

/** Campi aggiuntivi richiesti solo in enrichment (step 2 §13.1). */
export interface PlaceEnrichment {
  googlePlaceId: string;
  websiteUrl: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  openingHours: string[] | null;
  /** Resource name Google Places (`places/.../photos/...`), mai loghi. */
  photoNames: string[];
  /** timestamp dell'enrichment → leads.google_last_enriched_at */
  enrichedAt: string;
}

export interface GooglePlacesProvider {
  searchMinimal(query: DiscoveryQuery): Promise<DiscoveredPlace[]>;
  enrich(placeId: string): Promise<PlaceEnrichment>;
}
