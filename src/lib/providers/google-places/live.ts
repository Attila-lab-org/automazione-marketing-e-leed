/**
 * Adapter live Google Places API (New) — Text Search + Place Details.
 * Solo server-side: la API key non deve mai arrivare al client.
 */

import type {
  DiscoveredPlace,
  DiscoveryQuery,
  GooglePlacesProvider,
  PlaceEnrichment,
} from './types';

export interface GooglePlacesLiveConfig {
  apiKey: string;
}

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_BASE = 'https://places.googleapis.com/v1/places';

/** FieldMask minimo per discovery slice 1 (no phone — enrichment). */
export const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.types',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
].join(',');

const DETAILS_FIELD_MASK = [
  'id',
  'websiteUri',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
].join(',');

interface PlacesApiPlace {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]');
}

function extractPlaceId(place: PlacesApiPlace): string | null {
  if (place.id && place.id.trim()) return place.id.trim();
  if (place.name?.startsWith('places/')) return place.name.slice('places/'.length);
  return null;
}

function componentOf(
  components: PlacesApiPlace['addressComponents'],
  type: string,
): string | null {
  const hit = components?.find((c) => c.types?.includes(type));
  return hit?.longText?.trim() || hit?.shortText?.trim() || null;
}

function primaryCategory(types: string[] | undefined, fallback: string): string | null {
  if (!types?.length) return fallback.trim() || null;
  const skip = new Set(['point_of_interest', 'establishment', 'geocode', 'political']);
  const primary = types.find((t) => !skip.has(t));
  return primary ?? types[0] ?? (fallback.trim() || null);
}

export function mapPlaceToDiscovered(
  place: PlacesApiPlace,
  query: DiscoveryQuery,
): DiscoveredPlace | null {
  const googlePlaceId = extractPlaceId(place);
  const name = place.displayName?.text?.trim();
  if (!googlePlaceId || !name) return null;

  return {
    googlePlaceId,
    name,
    category: primaryCategory(place.types, query.category),
    address: place.formattedAddress?.trim() || null,
    city:
      componentOf(place.addressComponents, 'locality') ||
      componentOf(place.addressComponents, 'postal_town') ||
      query.location ||
      null,
    region:
      componentOf(place.addressComponents, 'administrative_area_level_1') || null,
    postalCode: componentOf(place.addressComponents, 'postal_code'),
    country: componentOf(place.addressComponents, 'country'),
    lat: typeof place.location?.latitude === 'number' ? place.location.latitude : null,
    lng: typeof place.location?.longitude === 'number' ? place.location.longitude : null,
    businessStatus: place.businessStatus ?? null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount:
      typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    websiteUrl: place.websiteUri?.trim() || null,
  };
}

async function placesFetch(
  url: string,
  apiKey: string,
  fieldMask: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
      ...(init?.headers ?? {}),
    },
  });
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

  async searchMinimal(query: DiscoveryQuery): Promise<DiscoveredPlace[]> {
    const max = Math.min(Math.max(query.maxResults ?? 5, 1), 5);
    const textQuery = `${query.category.trim()} ${query.location.trim()}`.trim();
    if (!textQuery) {
      throw new Error('GooglePlacesLive.searchMinimal: category e location sono obbligatorie');
    }

    const response = await placesFetch(SEARCH_ENDPOINT, this.config.apiKey, SEARCH_FIELD_MASK, {
      method: 'POST',
      body: JSON.stringify({
        textQuery,
        languageCode: 'it',
        regionCode: 'IT',
        pageSize: max,
      }),
    });

    if (!response.ok) {
      const body = sanitizeErrorMessage(await response.text());
      throw new Error(
        `GooglePlacesLive.searchMinimal fallito (${response.status}): ${body.slice(0, 400)}`,
      );
    }

    const data = (await response.json()) as { places?: PlacesApiPlace[] };
    const places = (data.places ?? [])
      .map((p) => mapPlaceToDiscovered(p, query))
      .filter((p): p is DiscoveredPlace => p !== null)
      .slice(0, max);

    if (query.businessStatus) {
      return places.filter(
        (p) => !p.businessStatus || p.businessStatus === query.businessStatus,
      );
    }
    return places;
  }

  async enrich(placeId: string): Promise<PlaceEnrichment> {
    const id = placeId.trim();
    if (!id) throw new Error('GooglePlacesLive.enrich: placeId mancante');

    const url = `${DETAILS_BASE}/${encodeURIComponent(id)}`;
    const response = await placesFetch(url, this.config.apiKey, DETAILS_FIELD_MASK, {
      method: 'GET',
    });

    if (!response.ok) {
      const body = sanitizeErrorMessage(await response.text());
      throw new Error(
        `GooglePlacesLive.enrich fallito (${response.status}): ${body.slice(0, 400)}`,
      );
    }

    const place = (await response.json()) as PlacesApiPlace;
    return {
      googlePlaceId: extractPlaceId(place) ?? id,
      websiteUrl: place.websiteUri?.trim() || null,
      phone:
        place.internationalPhoneNumber?.trim() ||
        place.nationalPhoneNumber?.trim() ||
        null,
      rating: typeof place.rating === 'number' ? place.rating : null,
      reviewCount:
        typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
      enrichedAt: new Date().toISOString(),
    };
  }
}
