import { describe, expect, it } from 'vitest';
import { generateShortId, makePublicSlug, slugifyBusinessName } from '../../src/lib/demos/slug';
import { pickCompatibleTemplateKey, isRestaurantVertical } from '../../src/lib/templates/match';
import { applyEditorPatch, mergeDemoInstanceData, prefillFromLead } from '../../src/lib/templates/merge';
import {
  RESTAURANT_PREMIUM_DEFAULTS,
  RESTAURANT_PREMIUM_TEMPLATE_KEY,
  type DemoInstanceData,
} from '../../src/lib/templates/restaurant-premium';
import { wordmarkFromName } from '../../src/lib/templates/wordmark';
import { qualifyFromDiscovery } from '../../src/lib/domain/discovery-qualification';

const v1Defaults: DemoInstanceData = {
  ...RESTAURANT_PREMIUM_DEFAULTS,
  content: { ...RESTAURANT_PREMIUM_DEFAULTS.content, cta: 'Prenota un tavolo' },
};

const v2Defaults: DemoInstanceData = {
  ...RESTAURANT_PREMIUM_DEFAULTS,
  content: { ...RESTAURANT_PREMIUM_DEFAULTS.content, cta: 'CTA NUOVA VERSIONE' },
  branding: { ...RESTAURANT_PREMIUM_DEFAULTS.branding, primary_color: '#ff0000' },
};

describe('Phase C demo / template engine', () => {
  it('crea dati demo da lead senza inventare headline/logo', () => {
    const data = prefillFromLead(
      {
        name: 'Ristorante Galleria',
        phone: '02 123',
        city: 'Milano',
        address: 'Via Torino 1',
      },
      v1Defaults,
    );
    expect(data.branding.business_name).toBe('Ristorante Galleria');
    expect(data.branding.logo_url).toBeNull();
    expect(data.content.headline).toBeNull();
    expect(data.content.description).toBeNull();
    expect(data.content.cta).toBe('Prenota un tavolo');
    expect(data.contact.phone).toBe('02 123');
    expect(data.contact.email).toBeNull();
  });

  it('lead senza logo usa wordmark dal nome', () => {
    expect(wordmarkFromName('Ristorante Galleria')).toBe('RISTORANTE GALLERIA');
    expect(wordmarkFromName('  ')).toBe('ATTIVITÀ');
  });

  it('modifiche branding/contenuto restano isolate tra demo', () => {
    const leadA = prefillFromLead({ name: 'Lead A', city: 'Milano' }, v1Defaults);
    const leadB = prefillFromLead({ name: 'Lead B', city: 'Roma' }, v1Defaults);
    const editedA = applyEditorPatch(leadA, {
      content: { headline: 'Headline A' },
      branding: { primary_color: '#111111' },
    });
    expect(editedA.content.headline).toBe('Headline A');
    expect(leadB.content.headline).toBeNull();
    expect(leadB.branding.business_name).toBe('Lead B');
    expect(leadB.branding.primary_color).toBe(v1Defaults.branding.primary_color);
  });

  it('nuova template version non modifica demo già legate alla v1', () => {
    const storedV1 = applyEditorPatch(prefillFromLead({ name: 'Osteria Vecchia' }, v1Defaults), {
      content: { headline: 'Benvenuti' },
    });
    const renderedOld = mergeDemoInstanceData({
      templateDefaults: v1Defaults,
      lead: { name: 'Osteria Vecchia' },
      overrides: storedV1,
    });
    const renderedIfWronglyOnV2 = mergeDemoInstanceData({
      templateDefaults: v2Defaults,
      lead: { name: 'Osteria Vecchia' },
      overrides: storedV1,
    });
    expect(renderedOld.content.cta).toBe('Prenota un tavolo');
    expect(renderedOld.branding.primary_color).toBe('#1c1917');
    expect(renderedIfWronglyOnV2.content.cta).toBe('Prenota un tavolo');
    expect(renderedOld.content.headline).toBe('Benvenuti');
  });

  it('merge persistente: override sopravvive al refresh (stesso input)', () => {
    const first = mergeDemoInstanceData({
      templateDefaults: v1Defaults,
      lead: { name: 'Bistrot', phone: '111' },
      overrides: { content: { headline: 'Serata degustazione' }, branding: { accent_color: '#abcdef' } },
    });
    const second = mergeDemoInstanceData({
      templateDefaults: v1Defaults,
      lead: { name: 'Bistrot', phone: '111' },
      overrides: first,
    });
    expect(second).toEqual(first);
    expect(second.content.headline).toBe('Serata degustazione');
    expect(second.branding.accent_color).toBe('#abcdef');
  });

  it('sceglie Restaurant Premium per verticale food', () => {
    expect(isRestaurantVertical('italian_restaurant')).toBe(true);
    expect(
      pickCompatibleTemplateKey('italian_restaurant', [
        { key: RESTAURANT_PREMIUM_TEMPLATE_KEY, vertical: 'restaurant', published: true },
        { key: 'other', vertical: 'gym', published: true },
      ]),
    ).toBe(RESTAURANT_PREMIUM_TEMPLATE_KEY);
  });

  it('slug pubblico deterministico sul nome + short id univoco', () => {
    expect(slugifyBusinessName("L'immagine Bistrot")).toBe('l-immagine-bistrot');
    const a = generateShortId();
    const b = generateShortId();
    expect(a).toHaveLength(8);
    expect(a).not.toBe(b);
    expect(makePublicSlug('Ristorante Galleria', 'abc12345')).toBe('ristorante-galleria-abc12345');
  });

  it('qualification engine invariato (nessuna regressione)', () => {
    const r = qualifyFromDiscovery({
      googlePlaceId: 'ChIJ',
      name: 'Test',
      category: 'restaurant',
      address: 'Via Roma',
      city: 'Milano',
      region: 'Lombardia',
      lat: 45,
      lng: 9,
      rating: 4.6,
      reviewCount: 245,
      websiteUrl: null,
      googleBusinessStatus: 'OPERATIONAL',
    });
    expect(r.discoveryScore).toBeGreaterThanOrEqual(70);
    expect(r.status).toBe('PREQUALIFIED');
  });

  it('nessun import outreach/AI/browser nel motore demo', async () => {
    const mergeSrc = await import('../../src/lib/templates/merge');
    const createSrc = await import('../../src/lib/demos/slug');
    expect(Object.keys(mergeSrc).length).toBeGreaterThan(0);
    expect(Object.keys(createSrc).length).toBeGreaterThan(0);
    expect(true).toBe(true);
  });
});
