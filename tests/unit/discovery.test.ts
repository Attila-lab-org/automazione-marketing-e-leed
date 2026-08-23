import { describe, expect, it } from 'vitest';
import { validateDiscoveryInput, DiscoveryValidationError } from '@/lib/leads/discovery';
import { discoveredPlaceToLeadInsert, normalizeDomain } from '@/lib/leads/normalize';
import { mapPlaceToDiscovered } from '@/lib/providers/google-places/live';
import type { DiscoveredPlace } from '@/lib/providers/google-places/types';

describe('validateDiscoveryInput', () => {
  it('accetta input valido e limita maxResults a 50', () => {
    expect(
      validateDiscoveryInput({
        category: 'Ristoranti',
        location: 'Milano',
        maxResults: 50,
      }),
    ).toEqual({ category: 'Ristoranti', location: 'Milano', maxResults: 50 });
  });

  it('rifiuta maxResults > 50', () => {
    expect(() =>
      validateDiscoveryInput({
        category: 'Ristoranti',
        location: 'Milano',
        maxResults: 80,
      }),
    ).toThrow(DiscoveryValidationError);
  });

  it('rifiuta località vuota', () => {
    expect(() =>
      validateDiscoveryInput({ category: 'Ristoranti', location: ' ' }),
    ).toThrow(DiscoveryValidationError);
  });
});

describe('normalizeDomain', () => {
  it('normalizza host senza www', () => {
    expect(normalizeDomain('https://www.Example.com/path')).toBe('example.com');
  });

  it('restituisce null su URL assente', () => {
    expect(normalizeDomain(null)).toBeNull();
  });
});

describe('discoveredPlaceToLeadInsert', () => {
  it('non inventa email/telefono e mappa Place ID', () => {
    const place: DiscoveredPlace = {
      googlePlaceId: 'ChIJtest',
      name: 'Trattoria Test',
      category: 'restaurant',
      address: 'Via Roma 1',
      city: 'Milano',
      region: 'Lombardia',
      postalCode: '20100',
      country: 'Italia',
      lat: 45.46,
      lng: 9.19,
      businessStatus: 'OPERATIONAL',
      rating: 4.5,
      reviewCount: 120,
      websiteUrl: 'https://www.trattoria.example.com',
    };
    const row = discoveredPlaceToLeadInsert(place, 'ws-1');
    expect(row.google_place_id).toBe('ChIJtest');
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.normalized_domain).toBe('trattoria.example.com');
    expect(row.rating).toBe(4.5);
    expect(row.business_status).toBe('NEW');
  });
});

describe('mapPlaceToDiscovered', () => {
  it('estrae id e componenti indirizzo', () => {
    const mapped = mapPlaceToDiscovered(
      {
        id: 'ChIJabc',
        displayName: { text: 'Osteria Duomo' },
        formattedAddress: 'Piazza Duomo, Milano',
        addressComponents: [
          { longText: 'Milano', types: ['locality'] },
          { longText: 'Lombardia', types: ['administrative_area_level_1'] },
        ],
        location: { latitude: 45.464, longitude: 9.19 },
        types: ['restaurant', 'food', 'point_of_interest'],
        businessStatus: 'OPERATIONAL',
        rating: 4.2,
        userRatingCount: 88,
        websiteUri: 'https://osteria.example.com',
      },
      { category: 'Ristoranti', location: 'Milano' },
    );
    expect(mapped?.googlePlaceId).toBe('ChIJabc');
    expect(mapped?.city).toBe('Milano');
    expect(mapped?.category).toBe('restaurant');
    expect(mapped?.websiteUrl).toBe('https://osteria.example.com');
  });
});
