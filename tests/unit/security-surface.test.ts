import { describe, expect, it } from 'vitest';
import { mapPool } from '@/lib/security/concurrency';
import { buildScopeLetter, buildSecurityEmail } from '@/lib/security/copy';
import { explainFinding, riskIfUnfixed } from '@/lib/security/explain';
import { displayNameForSite, homepageHref } from '@/lib/security/manual-site';
import {
  analyzeSurfacePage,
  scoreBand,
} from '@/lib/security/surface-audit';
import { isBlockedHostname, isPrivateIp, parsePublicHttpUrl, UrlNotAllowedError } from '@/lib/security/url-guard';

const HTTPS = 'https://www.studioesempio.it/';
const HTTP = 'http://www.studioesempio.it/';

function analyze(html: string, headers: Record<string, string>, url = HTTPS) {
  return analyzeSurfacePage({
    requestedUrl: url,
    finalUrl: url,
    httpStatus: 200,
    headers,
    html,
  });
}

const HARDENED = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
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
    expect(finding?.detail.toLowerCase()).not.toMatch(/probabilmente|vulnerabil|sfruttabil/);
    expect(result.score).toBeLessThanOrEqual(75);
  });

  it('segnala un modulo carta sul loro sito, non se c’è Stripe', () => {
    const own = analyze(
      '<form><input name="cardnumber" /></form>',
      HARDENED,
    );
    expect(own.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(true);
    expect(own.payment).toBe('own-form');

    const stripe = analyze(
      '<script src="https://js.stripe.com/v3/"></script><input name="cardnumber" />',
      HARDENED,
    );
    expect(stripe.payment).toBe('stripe');
    expect(stripe.findings.some((item) => item.code === 'CARD_FORM_OWN')).toBe(false);
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
    expect(codes).toEqual(expect.arrayContaining(['NO_CSP', 'NO_FRAME_PROTECTION', 'NO_NOSNIFF']));
    expect(codes.join(' ')).not.toMatch(/CVE|exploit/i);
    expect(scoreBand(result.score)).toMatch(/orange|red|green/);
  });

  it('segnala un anno vecchio solo se è scritto in pagina', () => {
    const result = analyze('<p>© 2018 Studio</p>', HARDENED, HTTPS);
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

  it('tronca una chiave visibile e non la stampa intera', () => {
    const result = analyze(
      '<script>const k="sk_live_abcdefghijklmnopqrstuv"</script>',
      HARDENED,
    );
    const secret = result.findings.find((item) => item.code === 'VISIBLE_SECRET');
    expect(secret).toBeTruthy();
    expect(secret?.evidence).toMatch(/^sk_live_/);
    expect(secret?.evidence).not.toContain('abcdefghijklmnopqrstuv');
  });
});

describe('copy email e lettera', () => {
  it('l’email elenca fatti e non dice probabilmente', () => {
    const analysis = analyze('<html>info@studioesempio.it</html>', HARDENED);
    const email = buildSecurityEmail({
      businessName: 'Studio Esempio',
      domain: 'studioesempio.it',
      analysis,
    });
    expect(email.subject).toMatch(/Cose visibili/);
    expect(email.text.toLowerCase()).not.toMatch(/probabilmente|vulnerabil|cve/);
    expect(email.text).toMatch(/come farebbe un visitatore/);
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
  });
});

describe('spiegazioni per l’utente medio', () => {
  it('ogni cosa vista ha significato e rischio se non sistema, senza dire probabilmente', () => {
    for (const code of [
      'NO_HTTPS',
      'BAD_CERT',
      'CARD_FORM_OWN',
      'NO_HSTS',
      'NO_CSP',
      'NO_FRAME_PROTECTION',
      'EMAILS_VISIBLE',
      'FORM_TO_HTTP',
      'MIXED_CONTENT',
      'ADMIN_LINK',
      'VISIBLE_SECRET',
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
