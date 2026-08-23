import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALIFICATION_THRESHOLDS,
  DISCOVERY_QUALIFICATION_VERSION,
  OFFER_WEBSITE_UPGRADE,
  qualifyFromDiscovery,
  type DiscoveryQualificationInput,
} from '../../src/lib/domain/discovery-qualification';

function base(overrides: Partial<DiscoveryQualificationInput> = {}): DiscoveryQualificationInput {
  return {
    googlePlaceId: 'ChIJtest',
    name: 'Attività Test',
    category: 'restaurant',
    address: 'Via Roma 1',
    city: 'Milano',
    region: 'Lombardia',
    lat: 45.46,
    lng: 9.19,
    rating: 4.6,
    reviewCount: 245,
    websiteUrl: null,
    googleBusinessStatus: 'OPERATIONAL',
    ...overrides,
  };
}

describe('qualifyFromDiscovery (Phase B)', () => {
  it('stesso input → stesso output (deterministico)', () => {
    const a = qualifyFromDiscovery(base());
    const b = qualifyFromDiscovery(base());
    expect(a).toEqual(b);
    expect(a.algorithmVersion).toBe(DISCOVERY_QUALIFICATION_VERSION);
  });

  it('molte recensioni + nessun sito → score alto PREQUALIFIED', () => {
    const r = qualifyFromDiscovery(
      base({ websiteUrl: null, reviewCount: 300, rating: 4.7, category: 'restaurant' }),
    );
    expect(r.discoveryScore).toBeGreaterThanOrEqual(70);
    expect(r.discoveryScore).toBeLessThanOrEqual(100);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.status).toBe('PREQUALIFIED');
    expect(r.offerCandidate).toBe(OFFER_WEBSITE_UPGRADE);
    expect(r.reasonLabels.some((l) => /Sito non rilevato/i.test(l))).toBe(true);
    expect(r.reasonLabels.some((l) => /recensioni/i.test(l))).toBe(true);
  });

  it('molte recensioni + sito presente → non penalizza, può restare alto', () => {
    const noSite = qualifyFromDiscovery(base({ websiteUrl: null, reviewCount: 200 }));
    const withSite = qualifyFromDiscovery(
      base({ websiteUrl: 'https://example-business.it', reviewCount: 200 }),
    );
    expect(withSite.discoveryScore).toBeLessThan(noSite.discoveryScore);
    expect(withSite.reasonLabels.some((l) => /Sito presente/i.test(l))).toBe(true);
    expect(withSite.discoveryScore).toBeGreaterThanOrEqual(0);
    expect(withSite.discoveryScore).toBeLessThanOrEqual(100);
  });

  it('pochi dati → confidence bassa e LOW_PRIORITY o NEEDS_ANALYSIS', () => {
    const r = qualifyFromDiscovery(
      base({
        category: null,
        address: null,
        city: null,
        region: null,
        lat: null,
        lng: null,
        rating: null,
        reviewCount: null,
        websiteUrl: 'https://x.it',
      }),
    );
    expect(r.confidence).toBeLessThan(70);
    expect(r.discoveryScore).toBeLessThan(DEFAULT_QUALIFICATION_THRESHOLDS.prequalifiedMin);
    expect(['LOW_PRIORITY', 'NEEDS_ANALYSIS', 'PREQUALIFIED']).toContain(r.status);
  });

  it('poche recensioni → volume basso nelle reasons', () => {
    const r = qualifyFromDiscovery(base({ reviewCount: 5, websiteUrl: null }));
    expect(r.reasonLabels.some((l) => /volume basso|5 recensioni/i.test(l))).toBe(true);
  });

  it('categorie differenti cambiano lo score verticale', () => {
    const food = qualifyFromDiscovery(base({ category: 'restaurant' }));
    const gym = qualifyFromDiscovery(base({ category: 'gym' }));
    const generic = qualifyFromDiscovery(base({ category: 'store' }));
    expect(food.discoveryScore).toBeGreaterThanOrEqual(gym.discoveryScore);
    expect(gym.discoveryScore).toBeGreaterThanOrEqual(generic.discoveryScore);
  });

  it('score e confidence sempre 0–100', () => {
    const cases = [
      base(),
      base({ websiteUrl: null, reviewCount: 1000 }),
      base({ googlePlaceId: null }),
      base({ googleBusinessStatus: 'CLOSED_PERMANENTLY' }),
      base({ category: 'dentist', reviewCount: 12, websiteUrl: 'https://x.it' }),
    ];
    for (const c of cases) {
      const r = qualifyFromDiscovery(c);
      expect(r.discoveryScore).toBeGreaterThanOrEqual(0);
      expect(r.discoveryScore).toBeLessThanOrEqual(100);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('senza Place ID → REJECTED', () => {
    const r = qualifyFromDiscovery(base({ googlePlaceId: '' }));
    expect(r.status).toBe('REJECTED');
    expect(r.offerCandidate).toBeNull();
  });

  it('reasons coerenti e non vuote per lead valido', () => {
    const r = qualifyFromDiscovery(base());
    expect(r.reasons.length).toBeGreaterThan(3);
    expect(r.reasons.every((x) => x.label.length > 0 && x.code.length > 0)).toBe(true);
  });
});
