import { describe, expect, it, vi } from 'vitest';
import {
  deepAnalysisFromRow,
  extractSafeSameSiteLinks,
  isSameAuthorizedSite,
  runAuthorizedDeepScan,
} from '@/lib/security/deep-scan';
import type { FetchedPage } from '@/lib/security/fetch-page';
import { fetchPublicPage } from '@/lib/security/fetch-page';
import type { SurfaceFinding } from '@/lib/security/surface-audit';
import type { SecurityDeepAuditRow } from '@/lib/types/database';

const HARDENED = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=()',
  'content-type': 'text/html; charset=utf-8',
};

function page(
  url: string,
  html: string,
  status = 200,
  headers: Record<string, string> = HARDENED,
): FetchedPage {
  return {
    requestedUrl: url,
    finalUrl: url,
    httpStatus: status,
    headers,
    html,
    htmlTruncated: false,
    redirectChain: [url],
  };
}

const baselineNoCsp: SurfaceFinding = {
  code: 'NO_CSP',
  severity: 'MEDIUM',
  category: 'protection',
  confidence: 'confirmed',
  title: 'CSP assente',
  detail: 'Manca CSP.',
  evidence: 'header assente',
  limit: 'Vale per la prima risposta.',
};

describe('deep scan autorizzata', () => {
  it('accetta www/apice ma non domini esterni', () => {
    const authorized = new URL('https://example.it/');
    expect(isSameAuthorizedSite(new URL('https://www.example.it/contatti'), authorized)).toBe(true);
    expect(isSameAuthorizedSite(new URL('https://example.it/servizi'), authorized)).toBe(true);
    expect(isSameAuthorizedSite(new URL('https://example.com/'), authorized)).toBe(false);
  });

  it('estrae solo link GET prudenti dello stesso sito', () => {
    const links = extractSafeSameSiteLinks(
      [
        '<a href="/contatti?campaign=1#form">Contatti</a>',
        '<a href="/chi-siamo#team">Chi siamo</a>',
        '<a href="/logout">Esci</a>',
        '<a href="/brochure.pdf">PDF</a>',
        '<a href="https://other.example/path">Fuori</a>',
        '<a href="mailto:info@example.it">Email</a>',
      ].join(''),
      'https://example.it/',
      'https://example.it/',
    );
    expect(links).toEqual(['https://example.it/chi-siamo']);
  });

  it('crea un secondo report, trova il campo carta e confronta il baseline', async () => {
    const calls: string[] = [];
    const responses = new Map<string, FetchedPage>([
      [
        'https://example.it/',
        page(
          'https://example.it/',
          '<title>Home</title><a href="/pagamenti">Paga</a><a href="/chi-siamo">Chi siamo</a><a href="https://outside.example/">Fuori</a>',
        ),
      ],
      [
        'https://example.it/pagamenti',
        page(
          'https://example.it/pagamenti',
          '<title>Pagamento</title><form><input autocomplete="cc-number"><input autocomplete="cc-csc"></form>',
        ),
      ],
      [
        'https://example.it/chi-siamo',
        page('https://example.it/chi-siamo', '<title>Chi siamo</title><p>La nostra storia</p>'),
      ],
      [
        'https://example.it/.well-known/security.txt',
        page('https://example.it/.well-known/security.txt', '', 404),
      ],
      [
        'https://example.it/robots.txt',
        page('https://example.it/robots.txt', 'User-agent: *', 200),
      ],
    ]);
    const fetcher = async (url: string): Promise<FetchedPage> => {
      calls.push(url);
      const response = responses.get(url);
      if (!response) throw new Error(`Unexpected GET ${url}`);
      return response;
    };

    const result = await runAuthorizedDeepScan(
      { targetUrl: 'https://example.it/some-old-path', baselineFindings: [baselineNoCsp] },
      fetcher,
    );

    expect(result.pages).toHaveLength(3);
    expect(result.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
    expect(result.comparison.newFindings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
    expect(result.comparison.notReproduced.some((item) => item.code === 'NO_CSP')).toBe(true);
    expect(result.score).toBeLessThanOrEqual(74);
    expect(calls).not.toContain('https://outside.example/');
    expect(calls.every((url) => !url.includes('logout'))).toBe(true);
    expect(result.metadata.requestsMade).toBe(5);
    expect(result.metadata.robotsTxt).toBe('present');
  });

  it('conferma nel secondo report un problema già visto', async () => {
    const baselineCard: SurfaceFinding = {
      ...baselineNoCsp,
      code: 'CARD_FORM_OWN',
      category: 'problem',
      severity: 'HIGH',
      title: 'Campo carta nel sito',
    };
    const fetcher = async (url: string): Promise<FetchedPage> => {
      if (url.endsWith('/.well-known/security.txt') || url.endsWith('/robots.txt')) {
        return page(url, '', 404);
      }
      return page(
        'https://example.it/',
        '<form><input name="cardnumber"></form>',
      );
    };

    const result = await runAuthorizedDeepScan(
      { targetUrl: 'https://example.it/', baselineFindings: [baselineCard] },
      fetcher,
    );
    expect(result.comparison.confirmed.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
  });

  it('una pagina interna 404 è un link rotto, non una homepage guasta', async () => {
    const fetcher = async (url: string): Promise<FetchedPage> => {
      if (url.endsWith('/.well-known/security.txt') || url.endsWith('/robots.txt')) {
        return page(url, '', 404);
      }
      if (url.endsWith('/vecchia-pagina')) {
        return page(url, '<title>Non trovata</title>', 404, {
          'content-type': 'text/html; charset=utf-8',
        });
      }
      return page(
        'https://example.it/',
        '<title>Home</title><a href="/vecchia-pagina">Pagina vecchia</a>',
      );
    };

    const result = await runAuthorizedDeepScan(
      { targetUrl: 'https://example.it/', baselineFindings: [] },
      fetcher,
    );
    expect(result.findings.some((item) => item.code === 'HOMEPAGE_ERROR')).toBe(false);
    expect(result.findings.find((item) => item.code === 'BROKEN_PUBLIC_PAGE')?.category).toBe('info');
    expect(result.comparison.newFindings).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('non conferma sulla homepage un problema visto soltanto in una pagina interna', async () => {
    const fetcher = async (url: string): Promise<FetchedPage> => {
      if (url.endsWith('/.well-known/security.txt') || url.endsWith('/robots.txt')) {
        return page(url, '', 404);
      }
      if (url.endsWith('/interna')) {
        return page(url, '<title>Interna</title>', 200, {
          'content-type': 'text/html; charset=utf-8',
        });
      }
      return page('https://example.it/', '<title>Home</title><a href="/interna">Interna</a>');
    };

    const result = await runAuthorizedDeepScan(
      { targetUrl: 'https://example.it/', baselineFindings: [baselineNoCsp] },
      fetcher,
    );
    expect(result.comparison.confirmed.some((item) => item.code === 'NO_CSP')).toBe(false);
    expect(result.comparison.newFindings.some((item) => item.code === 'NO_CSP')).toBe(true);
    expect(result.comparison.notReproduced.some((item) => item.code === 'NO_CSP')).toBe(true);
  });

  it('corregge in lettura i vecchi report che chiamavano homepage una pagina interna 404', () => {
    const row = {
      id: 'deep-1',
      workspace_id: 'workspace-1',
      target_id: 'target-1',
      lead_id: 'lead-1',
      baseline_audit_id: 'base-1',
      consent_channel: 'phone',
      consent_at: '2026-09-02T10:00:00.000Z',
      requested_url: 'https://example.it/',
      final_url: 'https://example.it/',
      status: 'completed',
      score: 55,
      pages_scanned: [],
      findings: [
        {
          code: 'HOMEPAGE_ERROR',
          severity: 'HIGH',
          category: 'problem',
          confidence: 'confirmed',
          title: 'Homepage guasta',
          detail: 'HTTP 404',
          evidence: 'HTTP 404',
          limit: 'Solo questa pagina.',
          pageUrls: ['https://example.it/about-us/'],
          occurrences: 1,
        },
        {
          ...baselineNoCsp,
          pageUrls: ['https://example.it/about-us/'],
          occurrences: 1,
        },
      ],
      comparison: {
        confirmed: 'dato vecchio non valido',
        newFindings: [
          { code: 'HOMEPAGE_ERROR', title: 'Homepage guasta' },
          { code: 'NO_CSP', title: 'CSP assente' },
        ],
        notReproduced: [],
      },
      metadata: {
        maxPages: 12,
        maxDepth: 2,
        requestsMade: 3,
        securityTxt: 'missing',
        robotsTxt: 'present',
        limits: [],
      },
      error: null,
      started_at: '2026-09-02T10:00:00.000Z',
      completed_at: '2026-09-02T10:01:00.000Z',
    } satisfies SecurityDeepAuditRow;

    const result = deepAnalysisFromRow(row);
    expect(result?.score).toBe(100);
    expect(result?.findings[0]?.code).toBe('BROKEN_PUBLIC_PAGE');
    expect(result?.findings[0]?.category).toBe('info');
    expect(result?.comparison.newFindings).toEqual([]);
  });
});

describe('fetch GET limitata', () => {
  it('interrompe lo stream al limite senza scaricare tutto il corpo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('abcdefghijklmnopqrstuvwxyz', { status: 200 })),
    );
    try {
      const result = await fetchPublicPage('http://8.8.8.8/test', { maxHtmlBytes: 8 });
      expect(result.html).toBe('abcdefgh');
      expect(result.htmlTruncated).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('blocca un redirect verso una rete privata prima della seconda GET', async () => {
    const mockedFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
    );
    vi.stubGlobal('fetch', mockedFetch);
    try {
      await expect(fetchPublicPage('http://8.8.8.8/')).rejects.toThrow(/sito pubblico/i);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
