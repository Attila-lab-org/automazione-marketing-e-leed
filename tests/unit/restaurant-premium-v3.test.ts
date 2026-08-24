import { describe, expect, it } from 'vitest';
import { resolveRendererKey } from '../../src/lib/templates/registry';
import {
  RESTAURANT_PREMIUM_RENDERER_KEY,
} from '../../src/lib/templates/restaurant-premium';
import { RESTAURANT_PREMIUM_V2_RENDERER_KEY } from '../../src/lib/templates/restaurant-premium-v2';
import {
  RESTAURANT_PREMIUM_V3_DEFAULTS,
  RESTAURANT_PREMIUM_V3_RENDERER_KEY,
} from '../../src/lib/templates/restaurant-premium-v3';
import { prefillFromLeadV3, normalizeDemoDataV3 } from '../../src/lib/templates/merge-v3';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '../../src/lib/templates/v3-assets';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '../../src/lib/templates/restaurant-premium-v2';

describe('Restaurant Premium V3', () => {
  it('V1 resta V1, V2 resta V2, V3 usa V3', () => {
    expect(resolveRendererKey(RESTAURANT_PREMIUM_RENDERER_KEY)).toBe(RESTAURANT_PREMIUM_RENDERER_KEY);
    expect(resolveRendererKey(RESTAURANT_PREMIUM_V2_RENDERER_KEY)).toBe(RESTAURANT_PREMIUM_V2_RENDERER_KEY);
    expect(resolveRendererKey(RESTAURANT_PREMIUM_V3_RENDERER_KEY)).toBe(RESTAURANT_PREMIUM_V3_RENDERER_KEY);
  });

  it('minimal lead data → full demo with template assets', () => {
    const data = prefillFromLeadV3(
      {
        name: 'Trattoria Duomo',
        city: 'Milano',
        rating: 4.7,
        reviewCount: 1082,
        address: 'Via Torino 12',
        phone: '+39 02 1234567',
      },
      RESTAURANT_PREMIUM_V3_DEFAULTS,
    );
    expect(data.branding.business_name).toBe('Trattoria Duomo');
    expect(data.contact.city).toBe('Milano');
    expect(data.signals.rating).toBe(4.7);
    expect(data.signals.review_count).toBe(1082);
    expect(data.branding.hero_image).toBe(RESTAURANT_PREMIUM_V3_ASSETS.hero);
    expect(data.branding.gallery.length).toBeGreaterThan(2);
    expect(data.content.headline).toBe(RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline);
    expect(data.content.headline).not.toContain('Un luogo da raccontare online');
  });

  it('missing logo keeps null (wordmark path); missing hero falls back via normalize', () => {
    const data = normalizeDemoDataV3({
      branding: { business_name: 'X', logo_url: null, hero_image: null, gallery: [] },
      content: {},
      contact: {},
      signals: {},
    });
    expect(data.branding.logo_url).toBeNull();
    expect(data.branding.hero_image).toBe(RESTAURANT_PREMIUM_V3_ASSETS.hero);
    expect(data.branding.gallery[0]).toContain('/restaurant-premium-v3/assets/');
  });

  it('real gallery overrides template imagery; colors override tokens', () => {
    const data = normalizeDemoDataV3({
      branding: {
        hero_image: 'https://cdn.example.com/hero.jpg',
        gallery: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        primary_color: '#111111',
        accent_color: '#cc5500',
      },
      content: {},
      contact: {},
      signals: {},
    });
    expect(data.branding.hero_image).toBe('https://cdn.example.com/hero.jpg');
    expect(data.branding.gallery).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ]);
    expect(data.branding.primary_color).toBe('#111111');
    expect(data.branding.accent_color).toBe('#cc5500');
  });

  it('missing opening hours stays null — no invented hours', () => {
    const data = prefillFromLeadV3(
      { name: 'Osteria', city: 'Milano', phone: '02' },
      RESTAURANT_PREMIUM_V3_DEFAULTS,
    );
    expect(data.contact.opening_hours).toBeNull();
  });

  it('V3 defaults do not mutate V2 defaults', () => {
    expect(RESTAURANT_PREMIUM_V2_DEFAULTS.content.headline).not.toBe(
      RESTAURANT_PREMIUM_V3_DEFAULTS.content.headline,
    );
    expect(RESTAURANT_PREMIUM_V3_DEFAULTS.branding.hero_image).toContain('restaurant-premium-v3');
  });
});
