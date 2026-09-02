import { describe, expect, it } from 'vitest';
import { mapPool } from '@/lib/security/concurrency';
import {
  buildScopeLetter,
  buildSecurityEmail,
  shouldPrepareSecurityEmail,
} from '@/lib/security/copy';
import { explainFinding, plainFindingTitle, riskIfUnfixed } from '@/lib/security/explain';
import { displayNameForSite, homepageHref } from '@/lib/security/manual-site';
import {
  analyzeSurfacePage,
  badCertAnalysis,
  computeSurfaceScore,
  findingsByCategory,
  scoreBand,
} from '@/lib/security/surface-audit';
import {
  hasUsableAuditAnalysis,
  securityTargetDomainChanged,
} from '@/lib/security/run-audit';
import type { SecurityAuditRow } from '@/lib/types/database';
import { isBlockedHostname, isPrivateIp, parsePublicHttpUrl, UrlNotAllowedError } from '@/lib/security/url-guard';

const HTTPS = 'https://www.studioesempio.it/';
const HTTP = 'http://www.studioesempio.it/';
const NBG = 'https://www.naturalborngamers.it/';

function analyze(
  html: string,
  headers: Record<string, string>,
  url = HTTPS,
  extra?: { httpStatus?: number; htmlTruncated?: boolean; redirectChain?: string[] },
) {
  return analyzeSurfacePage({
    requestedUrl: url,
    finalUrl: url,
    httpStatus: extra?.httpStatus ?? 200,
    headers,
    html,
    htmlTruncated: extra?.htmlTruncated,
    redirectChain: extra?.redirectChain,
  });
}

const HARDENED = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=()',
};

describe('parsePublicHttpUrl', () => {
  it('accetta un sito https pubblico', () => {
    expect(parsePublicHttpUrl('https://www.example.com/contatti').hostname).toBe('www.example.com');
  });

  it('rifiuta localhost e reti private', () => {
    expect(() => parsePublicHttpUrl('http://localhost/')).toThrow(UrlNotAllowedError);
    expect(() => parsePublicHttpUrl('http://127.0.0.1/')).toThrow(UrlNotAllowedError);
    expect(() => parsePublicHttpUrl('http://192.168.1.10/')).toThrow(UrlNotAllowedError);
    expect(() => parsePublicHttpUrl('http://10.0.0.8/admin')).toThrow(UrlNotAllowedError);
  });

  it('rifiuta schemi che non sono una pagina web', () => {
    expect(() => parsePublicHttpUrl('file:///etc/passwd')).toThrow(UrlNotAllowedError);
    expect(() => parsePublicHttpUrl('javascript:alert(1)')).toThrow(UrlNotAllowedError);
  });
});

describe('sito inserito a mano', () => {
  it('apre solo la homepage, anche se incolli un percorso', () => {
    expect(homepageHref('studiomazzei.it/contatti')).toBe('https://studiomazzei.it/');
    expect(homepageHref('https://www.studio.esempio/wp-admin')).toBe('https://www.studio.esempio/');
  });

  it('usa il nome scritto, altrimenti il dominio', () => {
    expect(displayNameForSite('Studio Mazzei', 'www.studiomazzei.it')).toBe('Studio Mazzei');
    expect(displayNameForSite('  ', 'www.studiomazzei.it')).toBe('studiomazzei.it');
  });

  it('non accetta un indirizzo interno', () => {
    expect(() => homepageHref('http://127.0.0.1')).toThrow(UrlNotAllowedError);
  });
});

describe('isPrivateIp / isBlockedHostname', () => {
  it('riconosce reti interne', () => {
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.0.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    expect(isBlockedHostname('studio.it')).toBe(false);
  });
});

describe('analyzeSurfacePage', () => {
  it('parte da 100 e non inventa falle se la pagina è in ordine', () => {
    const result = analyze('<html><body>Studio</body></html>', HARDENED);
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
    expect(result.headers.https).toBe(true);
  });

  it('segnala http senza lucchetto con prova sull’URL', () => {
    const result = analyze('<html></html>', {}, HTTP);
    const finding = result.findings.find((item) => item.code === 'NO_HTTPS');
    expect(finding).toBeTruthy();
    expect(finding?.evidence).toBe(HTTP);
    expect(finding?.category).toBe('problem');
    expect(finding?.detail.toLowerCase()).not.toMatch(/probabilmente|vulnerabil|sfruttabil/);
    expect(result.score).toBeLessThanOrEqual(75);
  });

  it('segnala un vero campo carta anche se la pagina carica Stripe', () => {
    const own = analyze('<form><input name="cardnumber" /></form>', HARDENED);
    expect(own.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
    expect(own.payment).toBe('own-form');

    const stripe = analyze(
      '<script src="https://js.stripe.com/v3/"></script>',
      HARDENED,
    );
    expect(stripe.payment).toBe('stripe');
    expect(stripe.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(false);

    const suspiciousStripe = analyze(
      '<script src="https://js.stripe.com/v3/"></script><form><input autocomplete="cc-number" /></form>',
      HARDENED,
    );
    expect(suspiciousStripe.payment).toBe('own-form');
    expect(suspiciousStripe.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
  });

  it('non prende twitter:card o un blog per un modulo della carta', () => {
    const blog = analyze(
      '<html><head><meta name="twitter:card" content="summary_large_image" /><meta name="generator" content="WordPress 6.8.8" /></head><body>Natural Born Gamers</body></html>',
      HARDENED,
      NBG,
    );
    expect(blog.payment).toBe('none');
    expect(blog.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(false);
  });

  it('Natural Born Gamers: niente falsi allarmi su card, pingback, link HTTP e numeri in script', () => {
    const html = `
      <html>
        <head>
          <meta name="twitter:card" content="summary_large_image" />
          <link rel="pingback" href="https://www.naturalborngamers.it/xmlrpc.php" />
          <meta name="generator" content="WordPress 6.8.8" />
        </head>
        <body>
          <a href="http://affiliate.example.com/go?id=42">Partner</a>
          <script>window.__cfg={phone:"3312345678",id:20240101};</script>
          <p>Scrivici a info@naturalborngamers.it</p>
          <a href="tel:+390212345678">02 12345678</a>
        </body>
      </html>
    `;
    const result = analyze(html, HARDENED, NBG);
    const codes = result.findings.map((item) => item.code);
    expect(codes).not.toContain('CARD_FORM_OWN');
    expect(codes).not.toContain('MIXED_CONTENT');
    expect(codes).not.toContain('ADMIN_LINK');
    expect(codes).toContain('WP_PINGBACK');
    expect(result.findings.find((item) => item.code === 'WP_PINGBACK')?.category).toBe('info');
    expect(result.findings.some((item) => item.code === 'EMAILS_VISIBLE')).toBe(true);
    expect(result.findings.find((item) => item.code === 'EMAILS_VISIBLE')?.category).toBe('info');
    // telefono da tel: sì; il numero nello script non deve finire nella prova
    expect(result.findings.some((item) => item.code === 'PHONES_VISIBLE')).toBe(true);
    expect(result.findings.find((item) => item.code === 'PHONES_VISIBLE')?.evidence).not.toMatch(/3312345678/);
  });

  it('numeri solo dentro script non diventano PHONES_VISIBLE', () => {
    const result = analyze(
      '<html><body><script>const x="3312345678";</script><p>Ciao</p></body></html>',
      HARDENED,
    );
    expect(result.findings.some((item) => item.code === 'PHONES_VISIBLE')).toBe(false);
  });

  it('segnala risorse HTTP caricate, non un semplice link affiliato', () => {
    const mixed = analyze(
      '<script src="http://cdn.studioesempio.it/app.js"></script><a href="http://partner.example/go">x</a>',
      HARDENED,
    );
    expect(mixed.findings.some((item) => item.code === 'MIXED_CONTENT')).toBe(true);
    expect(mixed.findings.find((item) => item.code === 'MIXED_CONTENT')?.evidence).toContain(
      'http://cdn.studioesempio.it/app.js',
    );
  });

  it('legge WordPress e email dal HTML, senza dire che la casella è violata', () => {
    const result = analyze(
      '<html><head><meta name="generator" content="WordPress 6.4"></head><body>wp-content info@studioesempio.it</body></html>',
      HARDENED,
    );
    expect(result.technologies.some((item) => /wordpress/i.test(item.name))).toBe(true);
    expect(result.emailsFound).toContain('info@studioesempio.it');
    const emailFinding = result.findings.find((item) => item.code === 'EMAILS_VISIBLE');
    expect(emailFinding?.detail).toMatch(/non è una prova che la casella sia stata violata/i);
    expect(emailFinding?.category).toBe('info');
  });

  it('email e telefono non abbassano il punteggio', () => {
    const base = analyze('<html><body>Studio</body></html>', HARDENED);
    const withContacts = analyze(
      '<html><body>info@studioesempio.it <a href="tel:+393331112233">333 1112233</a></body></html>',
      HARDENED,
    );
    expect(withContacts.findings.some((item) => item.code === 'EMAILS_VISIBLE')).toBe(true);
    expect(withContacts.findings.some((item) => item.code === 'PHONES_VISIBLE')).toBe(true);
    expect(withContacts.score).toBe(base.score);
    expect(withContacts.score).toBe(100);
  });

  it('elenca /api/ e GA4 senza trattarli come falle', () => {
    const result = analyze(
      '<script>fetch("/api/clienti")</script><script>gtag("config","G-ABCDEFG123")</script>',
      HARDENED,
    );
    expect(result.apiMentions.some((item) => item.includes('/api/clienti'))).toBe(true);
    expect(result.gaIds).toContain('G-ABCDEFG123');
    expect(result.findings.some((item) => item.code.includes('GA'))).toBe(false);
  });

  it('non toglie punti per CVE o ipotesi: solo intestazioni assenti', () => {
    const result = analyze('<html></html>', {
      'strict-transport-security': 'max-age=31536000',
    });
    const codes = result.findings.map((item) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining(['NO_CSP', 'NO_NOSNIFF', 'NO_REFERRER_POLICY', 'NO_PERMISSIONS_POLICY']),
    );
    // Con CSP assente non ripetiamo anche NO_FRAME_PROTECTION
    expect(codes).not.toContain('NO_FRAME_PROTECTION');
    expect(codes.join(' ')).not.toMatch(/CVE|exploit/i);
    expect(scoreBand(result.score)).toMatch(/orange|red|green/);
  });

  it('non doppia la penalità tra CSP assente e frame protection', () => {
    const result = analyze('<html></html>', {
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
    });
    expect(result.findings.some((item) => item.code === 'NO_CSP')).toBe(true);
    expect(result.findings.some((item) => item.code === 'NO_FRAME_PROTECTION')).toBe(false);
    expect(result.headers.frameProtection).toBe(false);
    expect(result.score).toBe(computeSurfaceScore(result.findings));
  });

  it('segnala un anno vecchio solo con contesto CMS in pagina', () => {
    const alone = analyze('<p>© 2018 Studio</p>', HARDENED, HTTPS);
    expect(alone.findings.some((item) => item.code === 'OLD_COPYRIGHT')).toBe(false);

    const result = analyze(
      '<html><head><meta name="generator" content="WordPress 6.4"></head><body><p>© 2018 Studio</p></body></html>',
      HARDENED,
      HTTPS,
    );
    expect(result.findings.some((item) => item.code === 'OLD_COPYRIGHT')).toBe(true);
    expect(result.findings.find((item) => item.code === 'OLD_COPYRIGHT')?.evidence).toBe('© 2018');
  });

  it('segnala lucchetto a metà, modulo senza https, login e link di accesso', () => {
    const result = analyze(
      [
        '<script src="http://cdn.studioesempio.it/app.js"></script>',
        '<form action="http://studioesempio.it/prenota"><input type="password" /></form>',
        '<a href="/wp-login.php">Entra</a>',
      ].join(''),
      HARDENED,
    );
    const codes = result.findings.map((item) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining(['MIXED_CONTENT', 'FORM_TO_HTTP', 'LOGIN_FORM', 'ADMIN_LINK']),
    );
    expect(result.findings.find((item) => item.code === 'FORM_TO_HTTP')?.evidence).toContain('http://');
  });

  it('segnala cookie senza Secure e versione server, senza inventare CVE', () => {
    const result = analyze('<html></html>', {
      ...HARDENED,
      server: 'Apache/2.4.41 (Ubuntu)',
      'set-cookie': 'session=abc; Path=/; HttpOnly',
    });
    expect(result.findings.some((item) => item.code === 'COOKIE_INSECURE')).toBe(true);
    expect(result.findings.find((item) => item.code === 'COOKIE_INSECURE')?.evidence).toBe('session');
    expect(result.findings.some((item) => item.code === 'SERVER_BANNER')).toBe(true);
    expect(result.findings.map((item) => item.detail).join(' ').toLowerCase()).not.toMatch(
      /cve|sfruttabil|probabilmente/,
    );
  });

  it('segnala cookie di sessione senza HttpOnly', () => {
    const result = analyze('<html></html>', {
      ...HARDENED,
      'set-cookie': 'sessionid=abc; Path=/; Secure; SameSite=Lax',
    });
    expect(result.findings.some((item) => item.code === 'COOKIE_NO_HTTPONLY')).toBe(true);
  });

  it('segnala cookie di sessione senza SameSite', () => {
    const result = analyze('<html></html>', {
      ...HARDENED,
      'set-cookie': 'sessionid=abc; Path=/; Secure; HttpOnly',
    });
    expect(result.headers.cookieHttpOnly).toBe(true);
    expect(result.headers.cookieSameSite).toBe(false);
    expect(result.findings.some((item) => item.code === 'COOKIE_NO_SAMESITE')).toBe(true);
  });

  it('accetta solo valori X-Frame-Options validi', () => {
    const invalid = analyze('<html></html>', {
      ...HARDENED,
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'ALLOW-FROM https://example.it',
    });
    expect(invalid.headers.frameProtection).toBe(false);
    expect(invalid.findings.some((item) => item.code === 'NO_FRAME_PROTECTION')).toBe(true);
  });

  it('valuta CSP debole e HSTS breve', () => {
    const result = analyze('<html></html>', {
      'strict-transport-security': 'max-age=60',
      'content-security-policy': "default-src * 'unsafe-inline' 'unsafe-eval'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
    });
    expect(result.headers.csp).toBe('weak');
    expect(result.findings.some((item) => item.code === 'CSP_WEAK')).toBe(true);
    expect(result.findings.some((item) => item.code === 'HSTS_WEAK')).toBe(true);
  });

  it('404/500 e body vuoto non producono un punteggio alto', () => {
    const notFound = analyze('<html>missing</html>', HARDENED, HTTPS, { httpStatus: 404 });
    expect(notFound.findings.some((item) => item.code === 'HOMEPAGE_ERROR')).toBe(true);
    expect(notFound.score).toBeLessThanOrEqual(74);

    const empty = analyze('   ', HARDENED, HTTPS, { httpStatus: 200 });
    expect(empty.findings.some((item) => item.code === 'HOMEPAGE_ERROR')).toBe(true);
    expect(empty.score).toBeLessThanOrEqual(80);
  });

  it('segna HTML troncato come informazione', () => {
    const result = analyze('<html><body>ok</body></html>', HARDENED, HTTPS, { htmlTruncated: true });
    const truncated = result.findings.find((item) => item.code === 'HTML_TRUNCATED');
    expect(truncated?.category).toBe('info');
    expect(result.score).toBe(100);
  });

  it('tronca una chiave visibile e non la stampa intera', () => {
    const result = analyze('<script>const k="sk_live_abcdefghijklmnopqrstuv"</script>', HARDENED);
    const secret = result.findings.find((item) => item.code === 'VISIBLE_SECRET');
    expect(secret).toBeTruthy();
    expect(secret?.evidence).toMatch(/^sk_live_/);
    expect(secret?.evidence).not.toContain('abcdefghijklmnopqrstuv');
    expect(secret?.category).toBe('problem');
  });

  it('non scambia chiavi pubblicabili Stripe o JWT client per segreti confermati', () => {
    const result = analyze(
      '<script>window.pk="pk_live_abcdefghijklmnopqrst"; window.session="eyJabcdefghijabcdefghijabcdefghij.abcdefghijabcdefghij.abcdefghijabcdefghij";</script>',
      HARDENED,
    );
    expect(result.findings.some((item) => item.code === 'VISIBLE_SECRET')).toBe(false);
  });

  it('un problema HIGH non resta in fascia verde', () => {
    const result = analyze('<form><input name="cardnumber" /></form>', HARDENED);
    expect(result.findings.some((item) => item.code === 'CARD_FORM_OWN' && item.severity === 'HIGH')).toBe(
      true,
    );
    expect(result.score).toBeLessThanOrEqual(74);
  });

  it('raggruppa problemi, protezioni e informazioni', () => {
    const result = analyze(
      '<html><body>info@studio.esempio.it<a href="/wp-login.php">x</a></body></html>',
      {},
    );
    const grouped = findingsByCategory(result.findings);
    expect(grouped.problems.length + grouped.protections.length + grouped.infos.length).toBe(
      result.findings.length,
    );
    expect(grouped.infos.some((item) => item.code === 'EMAILS_VISIBLE')).toBe(true);
  });
});

describe('badCertAnalysis', () => {
  it('classifica il certificato non valido e applica lo stesso punteggio', () => {
    const analysis = badCertAnalysis('CERT_HAS_EXPIRED');
    expect(analysis.findings[0]?.code).toBe('BAD_CERT');
    expect(analysis.findings[0]?.category).toBe('problem');
    expect(analysis.score).toBe(computeSurfaceScore(analysis.findings));
    expect(analysis.score).toBeLessThanOrEqual(74);
  });
});

describe('copy email e lettera', () => {
  it('prepara la bozza per problemi o protezioni, non per semplici informazioni', () => {
    const onlyContact = analyze('<html>info@studioesempio.it</html>', HARDENED);
    const missingProtections = analyze('<html>info@studioesempio.it</html>', {});
    const withoutOptionalPolicy = Object.fromEntries(
      Object.entries(HARDENED).filter(([name]) => name !== 'permissions-policy'),
    );
    const oneOptionalProtection = analyze('<html></html>', withoutOptionalPolicy);
    expect(shouldPrepareSecurityEmail(onlyContact)).toBe(false);
    expect(shouldPrepareSecurityEmail(missingProtections)).toBe(true);
    expect(shouldPrepareSecurityEmail(oneOptionalProtection)).toBe(false);
  });

  it('l’email elenca fatti e non dice probabilmente', () => {
    const analysis = analyze('<html>info@studioesempio.it</html>', {});
    const email = buildSecurityEmail({
      businessName: 'Studio Esempio',
      domain: 'studioesempio.it',
      analysis,
    });
    expect(email.subject).toMatch(/Cose visibili/);
    expect(email.text.toLowerCase()).not.toMatch(/probabilmente|vulnerabil|cve/);
    expect(email.text).toMatch(/come farebbe un visitatore/);
    expect(email.text).toMatch(/Protezione consigliata/);
    expect(email.text).not.toMatch(/Informazioni pubbliche/);
    expect(email.text).toMatch(/Manca una regola che limita codice estraneo/);
  });

  it('la lettera accetta anche il permesso al telefono, non è un attacco', () => {
    const letter = buildScopeLetter({ businessName: 'Studio Esempio', domain: 'studioesempio.it' });
    expect(letter).toMatch(/telefono/i);
    expect(letter).toMatch(/autorizza/i);
    expect(letter.toLowerCase()).toMatch(/non è un attacco/);
  });

  it('l’email dice cosa si vede e cosa rischia se non sistema', () => {
    const analysis = analyze('<html></html>', {}, HTTP);
    const email = buildSecurityEmail({
      businessName: 'Studio Esempio',
      domain: 'studioesempio.it',
      analysis,
    });
    expect(email.text).toMatch(/In pratica:/);
    expect(email.text).toMatch(/Se non sistemi:/);
    expect(email.text).toMatch(/Wi-Fi|fiducia/i);
    expect(email.text).toMatch(/prima di questa mail/);
    expect(email.text).toMatch(/Da sistemare/);
  });
});

describe('validità del primo report', () => {
  const failedAudit = {
    id: 'audit-1',
    workspace_id: 'workspace-1',
    target_id: 'target-1',
    lead_id: 'lead-1',
    requested_url: 'https://example.it/',
    final_url: null,
    http_status: null,
    score: 0,
    headers: {},
    technologies: [],
    findings: [],
    emails_found: [],
    api_mentions: [],
    ga_ids: [],
    error: 'TIMEOUT',
    created_at: '2026-09-02T10:00:00.000Z',
  } satisfies SecurityAuditRow;

  it('non usa come baseline una richiesta fallita senza alcuna evidenza', () => {
    expect(hasUsableAuditAnalysis(failedAudit)).toBe(false);
    expect(
      hasUsableAuditAnalysis({
        ...failedAudit,
        findings: [
          {
            code: 'BAD_CERT',
            severity: 'HIGH',
            category: 'problem',
            confidence: 'confirmed',
            title: 'Certificato non valido',
            detail: 'Il certificato HTTPS non è valido.',
            evidence: 'CERT',
            limit: 'La connessione è stata interrotta.',
          },
        ],
      }),
    ).toBe(true);
  });

  it('richiede nuovi report e consenso quando cambia il dominio', () => {
    expect(
      securityTargetDomainChanged('https://www.example.it/', 'https://example.it/contatti'),
    ).toBe(false);
    expect(
      securityTargetDomainChanged('https://example.it/', 'https://nuovo-sito.it/'),
    ).toBe(true);
  });
});

describe('spiegazioni per l’utente medio', () => {
  it('ogni cosa vista ha significato e rischio se non sistema, senza dire probabilmente', () => {
    for (const code of [
      'NO_HTTPS',
      'BAD_CERT',
      'HOMEPAGE_ERROR',
      'CARD_FORM_OWN',
      'NO_HSTS',
      'HSTS_WEAK',
      'NO_CSP',
      'CSP_WEAK',
      'NO_FRAME_PROTECTION',
      'EMAILS_VISIBLE',
      'FORM_TO_HTTP',
      'MIXED_CONTENT',
      'ADMIN_LINK',
      'WP_PINGBACK',
      'VISIBLE_SECRET',
      'COOKIE_NO_HTTPONLY',
      'HTML_TRUNCATED',
    ]) {
      const explained = explainFinding(code);
      expect(explained.meaning.length).toBeGreaterThan(20);
      expect(explained.risk.length).toBeGreaterThan(20);
      expect(explained.risk.toLowerCase()).not.toMatch(/^se non sistemi/);
      expect(riskIfUnfixed(explained.risk)).toMatch(/^Se non sistemi:/);
      expect(`${explained.meaning} ${explained.risk}`.toLowerCase()).not.toMatch(
        /probabilmente|cve|sfruttabil/,
      );
    }
  });

  it('ogni codice mostrato ha un titolo comprensibile dedicato', () => {
    const codes = [
      'NO_HTTPS',
      'BAD_CERT',
      'HOMEPAGE_ERROR',
      'BROKEN_PUBLIC_PAGE',
      'CARD_FORM_OWN',
      'FORM_TO_HTTP',
      'MIXED_CONTENT',
      'COOKIE_INSECURE',
      'COOKIE_NO_HTTPONLY',
      'COOKIE_NO_SAMESITE',
      'VISIBLE_SECRET',
      'VISIBLE_MAPS_KEY',
      'ADMIN_LINK',
      'WP_PINGBACK',
      'LOGIN_FORM',
      'FILE_UPLOAD',
      'SERVER_BANNER',
      'GENERATOR_VERSION',
      'SOURCEMAP',
      'NO_HSTS',
      'HSTS_WEAK',
      'NO_CSP',
      'CSP_REPORT_ONLY',
      'CSP_WEAK',
      'NO_FRAME_PROTECTION',
      'NO_NOSNIFF',
      'NO_REFERRER_POLICY',
      'NO_PERMISSIONS_POLICY',
      'EMAILS_VISIBLE',
      'PHONES_VISIBLE',
      'OLD_COPYRIGHT',
      'HTML_TRUNCATED',
      'SECURITY_TXT_PRESENT',
    ];
    for (const code of codes) {
      expect(plainFindingTitle(code, 'FALLBACK')).not.toBe('FALLBACK');
    }
  });
});

describe('mapPool', () => {
  it('rispetta l’ordine e il limite di parallelo', async () => {
    const seen: number[] = [];
    const result = await mapPool([1, 2, 3, 4], 2, async (n) => {
      seen.push(n);
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40]);
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
  });
});
