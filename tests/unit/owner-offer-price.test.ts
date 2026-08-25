import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getOwnerOfferPrice,
  isOwnerBridgeEnabled,
  ownerFinalBody,
  ownerRibbonBody,
} from '../../src/lib/templates/owner-commercial';
import { buildWhatsAppUrl } from '../../src/lib/templates/v3-cta';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '../../src/lib/templates/v3-assets';

describe('OWNER_OFFER_PRICE', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('owner price missing → nessun 350€ in copy/WhatsApp', () => {
    delete process.env.OWNER_OFFER_PRICE;
    expect(getOwnerOfferPrice()).toBeNull();
    expect(ownerFinalBody(null)).not.toMatch(/350/);
    expect(ownerRibbonBody(null)).not.toMatch(/350/);
    expect(JSON.stringify(RESTAURANT_PREMIUM_V3_CONCEPT_COPY)).not.toMatch(/350/);

    const url = buildWhatsAppUrl({
      phoneOrUrl: '3462689082',
      businessName: 'Trattoria',
      slug: 'trattoria',
      offerPrice: null,
    });
    expect(decodeURIComponent(url!)).not.toMatch(/350/);
  });

  it('owner price configured → prezzo disponibile', () => {
    process.env.OWNER_OFFER_PRICE = '350€';
    expect(getOwnerOfferPrice()).toBe('350€');
    expect(ownerFinalBody('350€')).toContain('350€');
    expect(ownerRibbonBody('350€')).toContain('350€');

    const url = buildWhatsAppUrl({
      phoneOrUrl: '3462689082',
      businessName: 'Trattoria',
      slug: 'trattoria',
      offerPrice: '350€',
    });
    expect(decodeURIComponent(url!)).toContain('350€');
  });

  it('OwnerBridge segue i canali commerciali ma può essere disattivato', () => {
    delete process.env.OWNER_SHOW_BRIDGE;
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_OWNER_CONTACT_URL;
    expect(isOwnerBridgeEnabled()).toBe(false);
    process.env.OWNER_WHATSAPP = '3462689082';
    expect(isOwnerBridgeEnabled()).toBe(true);
    process.env.OWNER_SHOW_BRIDGE = 'off';
    expect(isOwnerBridgeEnabled()).toBe(false);
  });
});
