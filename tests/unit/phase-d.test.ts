import { describe, expect, it } from 'vitest';
import { isPublicApi, isPublicPath } from '../../src/lib/auth/constants';
import { pickCompatibleTemplateKey } from '../../src/lib/templates/match';
import { resolveRendererKey, UnsupportedRendererError } from '../../src/lib/templates/registry';
import {
  RESTAURANT_PREMIUM_RENDERER_KEY,
  RESTAURANT_PREMIUM_TEMPLATE_KEY,
} from '../../src/lib/templates/restaurant-premium';
import { RESTAURANT_PREMIUM_V2_RENDERER_KEY } from '../../src/lib/templates/restaurant-premium-v2';
import { prefillFromLeadV2, normalizeDemoDataV2 } from '../../src/lib/templates/merge-v2';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '../../src/lib/templates/restaurant-premium-v2';
import { defaultEmailEnrichmentProvider } from '../../src/lib/enrichment/email-from-website';
import { runSendGuard } from '../../src/lib/send-guard';
import { ResendMock } from '../../src/lib/providers/resend/mock';

describe('Phase D — template matching', () => {
  it('dentist non riceve Restaurant Premium per fallback', () => {
    expect(
      pickCompatibleTemplateKey('dentist', [
        { key: RESTAURANT_PREMIUM_TEMPLATE_KEY, vertical: 'restaurant', published: true },
      ]),
    ).toBeNull();
  });

  it('renderer sconosciuto → errore controllato', () => {
    expect(() => resolveRendererKey('unknown-template')).toThrow(UnsupportedRendererError);
  });

  it('V1 e V2 hanno renderer distinti', () => {
    expect(resolveRendererKey(RESTAURANT_PREMIUM_RENDERER_KEY)).toBe(RESTAURANT_PREMIUM_RENDERER_KEY);
    expect(resolveRendererKey(RESTAURANT_PREMIUM_V2_RENDERER_KEY)).toBe(RESTAURANT_PREMIUM_V2_RENDERER_KEY);
  });
});

describe('Phase D — Restaurant Premium V2 data', () => {
  it('non inventa headline/recensioni testuali', () => {
    const data = prefillFromLeadV2(
      { name: 'Trattoria Roma', rating: 4.5, reviewCount: 120, city: 'Roma' },
      RESTAURANT_PREMIUM_V2_DEFAULTS,
    );
    expect(data.branding.business_name).toBe('Trattoria Roma');
    expect(data.content.headline).toBeNull();
    expect(data.content.description).toBeNull();
    expect(data.signals.rating).toBe(4.5);
    expect(data.signals.review_count).toBe(120);
  });

  it('V1 defaults congelati indipendenti da V2 defaults', () => {
    const v2 = normalizeDemoDataV2({ content: { cta: 'CTA V2' } });
    expect(v2.content.cta).toBe('CTA V2');
    expect(RESTAURANT_PREMIUM_V2_DEFAULTS.content.cta).toBe('Prenota un tavolo');
  });
});

describe('Phase D — email enrichment', () => {
  it('estrae email da mailto:', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response('<a href="mailto:info@ristorante.it">Contatti</a>', { status: 200 });
    const result = await defaultEmailEnrichmentProvider.enrichFromWebsite('https://ristorante.it');
    global.fetch = originalFetch;
    expect(result.email).toBe('info@ristorante.it');
    expect(result.status).toBe('FOUND');
  });

  it('senza email → NOT_FOUND', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response('<p>Solo telefono</p>', { status: 200 });
    const result = await defaultEmailEnrichmentProvider.enrichFromWebsite('https://ristorante.it');
    global.fetch = originalFetch;
    expect(result.email).toBeNull();
    expect(result.status).toBe('NOT_FOUND');
  });
});

describe('Phase D — send guard & outreach', () => {
  it('kill switch globale blocca send', () => {
    const guard = runSendGuard({
      recipient: { email: 'a@b.it', emailValid: true, suppressed: false },
      lead: { businessStatus: 'NEW', hasBlockingReply: false },
      campaign: { status: 'ACTIVE', rateLimitAvailable: true, outreachPausedAll: true },
      policy: { evaluation: null, humanApproved: true },
      message: { subject: 'x', body: 'y', status: 'APPROVED' },
      demo: { required: true, demoReady: true, screenshotReady: true },
      idempotency: { alreadySent: false },
    });
    expect(guard.allowed).toBe(false);
    expect(guard.blockers.some((b) => b.includes('OUTREACH') || b.includes('pausa'))).toBe(true);
  });

  it('duplicate SEND_MESSAGE impossibile via idempotency mock Resend', async () => {
    const resend = new ResendMock();
    const payload = {
      from: 'test@example.com',
      to: 'lead@example.com',
      subject: 'Test',
      html: '<p>Hi</p>',
      idempotencyKey: 'SEND_MESSAGE:campaign_lead:cl1:step:0',
    };
    const first = await resend.send(payload);
    const second = await resend.send(payload);
    expect(first.providerMessageId).toBe(second.providerMessageId);
    expect(resend.sentMessages).toHaveLength(1);
  });
});

describe('Phase D — auth surface', () => {
  it('demo pubblica e email-preview restano pubbliche', () => {
    expect(isPublicPath('/demo/ristorante-abc')).toBe(true);
    expect(isPublicApi('/demo/ristorante-abc/email-preview')).toBe(true);
    expect(isPublicPath('/overview')).toBe(false);
  });
});
