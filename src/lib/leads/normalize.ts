/**
 * Normalizzazione Google Places → modello lead (schema 0002).
 * Nessun valore inventato: campi assenti restano null.
 */

import type { DiscoveredPlace } from '@/lib/providers/google-places/types';
import type { LeadInsert } from '@/lib/types/database';

export function normalizeDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  try {
    const raw = websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`;
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

export function discoveredPlaceToLeadInsert(
  place: DiscoveredPlace,
  workspaceId: string,
): LeadInsert {
  return {
    workspace_id: workspaceId,
    google_place_id: place.googlePlaceId,
    name: place.name,
    category: place.category,
    subcategory: null,
    address: place.address,
    city: place.city,
    region: place.region,
    postal_code: place.postalCode,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    website_url: place.websiteUrl,
    normalized_domain: normalizeDomain(place.websiteUrl),
    phone: null,
    email: null,
    normalized_phone: null,
    normalized_email: null,
    business_status: 'NEW',
    processing_status: 'IDLE',
    current_score: null,
    current_confidence: null,
    rating: place.rating,
    review_count: place.reviewCount,
    google_last_enriched_at: null,
  };
}
