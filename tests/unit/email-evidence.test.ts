import { describe, expect, it } from 'vitest';
import {
  defaultEmailEnrichmentProvider,
  formatEmailEvidenceLabel,
  pickPublicEmail,
} from '../../src/lib/enrichment/email-from-website';

describe('Email enrichment evidence — selected candidate provenance', () => {
  it('selected email evidence corresponds to selected candidate (not first page)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contatti')) {
        return new Response(
          '<a href="mailto:info@ristorante.it">Contatti</a>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      // Home has a different (worse) email first
      return new Response('<p>support@wix.com</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    const result = await defaultEmailEnrichmentProvider.enrichFromWebsite('https://ristorante.it');
    global.fetch = originalFetch;

    expect(result.status).toBe('FOUND');
    expect(result.email).toBe('info@ristorante.it');
    expect(result.sourceUrl).toContain('/contatti');
    expect(result.sourceType).toBe('mailto');
    expect(result.sameDomain).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);

    const selected = result.candidateEvidence.find((c) => c.email === result.email);
    expect(selected).toBeDefined();
    expect(selected!.sourceUrl).toBe(result.sourceUrl);
    expect(selected!.sourceType).toBe(result.sourceType);

    expect(result.candidates).not.toContain('support@wix.com');
    expect(result.candidateEvidence.some((c) => c.email === 'support@wix.com')).toBe(false);
  });

  it('formatEmailEvidenceLabel is discreet for Review Queue', () => {
    const label = formatEmailEvidenceLabel({
      sourceUrl: 'https://ristorante.it/contatti',
      sourceType: 'mailto',
      confidence: 0.95,
    });
    expect(label).toBe('trovata su /contatti · mailto · confidence alta');
  });

  it('picks a visible page email even without mailto or same domain', () => {
    expect(pickPublicEmail(['info@studioesempio.it'], 'altro.it')).toBe('info@studioesempio.it');
  });

  it('ignores builder/platform junk emails', () => {
    expect(pickPublicEmail(['support@wix.com', 'user@schema.org'], 'ristorante.it')).toBeNull();
  });

  it('homepage text email without mailto is FOUND and saved as a candidate', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response('<p>Per prenotare: info@ristorante.it</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

    const result = await defaultEmailEnrichmentProvider.enrichFromWebsite('https://ristorante.it');
    global.fetch = originalFetch;

    expect(result.status).toBe('FOUND');
    expect(result.email).toBe('info@ristorante.it');
    expect(result.sourceType).toBe('page_text');
  });

  it('only platform emails are NOT_FOUND', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response('<p>support@wix.com</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

    const result = await defaultEmailEnrichmentProvider.enrichFromWebsite('https://ristorante.it');
    global.fetch = originalFetch;

    expect(result.status).toBe('NOT_FOUND');
    expect(result.email).toBeNull();
  });
});
