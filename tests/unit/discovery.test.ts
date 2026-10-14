import { describe, expect, it } from 'vitest';
import { validateDiscoveryInput, DiscoveryValidationError } from '@/lib/leads/discovery';
import { planDiscoveryLocations } from '@/lib/leads/discovery-areas';
import { discoveredPlaceToLeadInsert, normalizeDomain } from '@/lib/leads/normalize';
import { mapPlaceToDiscovered } from '@/lib/providers/google-places/live';
import type { DiscoveredPlace } from '@/lib/providers/google-places/types';

describe('validateDiscoveryInput', () => {
  it('accetta input valido e limita maxResults a 60', () => {
    expect(
      validateDiscoveryInput({
        category: 'Ristoranti',
        location: 'Milano',
        maxResults: 60,
      }),
    ).toEqual({ category: 'Ristoranti', location: 'Milano', maxResults: 60 });
  });

  it('rifiuta maxResults > 60', () => {
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

describe('planDiscoveryLocations', () => {
  it('la prima ricerca di una città grande resta sulla città', () => {
    expect(planDiscoveryLocations({ location: 'Milano', alreadySearched: [] })).toEqual(['Milano']);
  });

  it('la ricerca successiva passa alle zone non ancora usate', () => {
    expect(
      planDiscoveryLocations({
        location: 'Milano',
        alreadySearched: ['Milano', 'Milano Navigli'],
        limit: 2,
      }),
    ).toEqual(['Milano Isola', 'Milano Porta Romana']);
  });

  it('una città piccola, già cercata, prova i punti cardinali', () => {
    expect(
      planDiscoveryLocations({
        location: 'Soresina',
        alreadySearched: ['Soresina'],
        limit: 2,
      }),
    ).toEqual(['Soresina centro', 'Soresina nord']);
  });

  it('quando le zone conosciute sono finite non ripete la stessa ricerca', () => {
    const areas = planDiscoveryLocations({ location: 'Verona', alreadySearched: [] });
    expect(areas).toEqual(['Verona']);
    const done = ['Verona', 'Verona Centro', 'Verona Borgo Trento', 'Verona San Zeno', 'Verona Borgo Roma', 'Verona Golosine'];
    expect(planDiscoveryLocations({ location: 'Verona', alreadySearched: done })).toEqual([]);
  });
});
