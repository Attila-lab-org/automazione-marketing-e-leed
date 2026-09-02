/**
 * Analisi della sola pagina pubblica già scaricata.
 * Un solo GET: ogni voce ha prova, categoria e limite di ciò che dimostra.
 */

import { parse as parseHtml, type HTMLElement } from 'node-html-parser';

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingCategory = 'problem' | 'protection' | 'info';
export type FindingConfidence = 'confirmed' | 'likely' | 'info';

export type SurfaceFinding = {
  code: string;
  severity: FindingSeverity;
  category: FindingCategory;
  confidence: FindingConfidence;
  title: string;
  detail: string;
  evidence: string;
  /** Cosa questa prova non dimostra. */
  limit: string;
};

export type HeaderChecklist = {
  https: boolean;
  hsts: boolean | null;
  csp: 'present' | 'report-only' | 'missing' | 'weak';
  frameProtection: boolean;
  nosniff: boolean;
  referrerPolicy: boolean;
  permissionsPolicy: boolean;
  cookieSecure: boolean | null;
  cookieHttpOnly: boolean | null;
  cookieSameSite: boolean | null;
};

export type DetectedTechnology = {
  name: string;
  evidence: string;
};

export type PaymentSignal =
  | 'stripe'
  | 'paypal'
  | 'satispay'
  | 'nexi'
  | 'adyen'
  | 'square'
  | 'own-form'
  | 'none';

export type SurfaceAnalysisInput = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: Record<string, string>;
  html: string;
  htmlTruncated?: boolean;
  redirectChain?: string[];
};

export type SurfaceAnalysis = {
  score: number;
  headers: HeaderChecklist;
  technologies: DetectedTechnology[];
  findings: SurfaceFinding[];
  emailsFound: string[];
  apiMentions: string[];
  gaIds: string[];
  payment: PaymentSignal;
  httpStatus: number;
  htmlTruncated: boolean;
  redirectChain: string[];
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const API_RE = /(?:https?:\/\/[^"' \s]+)?\/api\/[a-z0-9_\-./?=&%]*/gi;
const GA4_RE = /\bG-[A-Z0-9]{6,14}\b/g;
const UA_RE = /\bUA-\d{4,10}-\d{1,4}\b/g;
const COPYRIGHT_RE = /(?:©|&copy;|copyright)\s*(?:20)?(\d{2,4})/gi;

const EMAIL_NOISE = [
  'w3.org',
  'schema.org',
  'example.com',
  'example.org',
  'sentry.io',
  'google.com',
  'gstatic.com',
  'cloudflare.com',
  'wordpress.org',
  'wixpress.com',
  'googleapis.com',
  'github.com',
];

const EXTERNAL_PAYMENTS: Array<{ signal: PaymentSignal; needles: string[] }> = [
  { signal: 'stripe', needles: ['js.stripe.com', 'checkout.stripe.com', 'stripe.com/v3'] },
  { signal: 'paypal', needles: ['paypal.com', 'paypalobjects.com'] },
  { signal: 'satispay', needles: ['satispay'] },
  { signal: 'nexi', needles: ['nexi.it', 'xpay.nexigroup.com', 'ecommerce.nexi.it'] },
  { signal: 'adyen', needles: ['checkoutshopper', 'adyen.com'] },
  { signal: 'square', needles: ['squareup.com', 'squarecdn.com'] },
];

/** Solo problemi e protezioni entrano nel punteggio. Le info no. */
const SCORE_DELTA: Record<string, number> = {
  NO_HTTPS: 25,
  BAD_CERT: 25,
  HOMEPAGE_ERROR: 20,
  CARD_FORM_OWN: 20,
  FORM_TO_HTTP: 18,
  VISIBLE_SECRET: 16,
  MIXED_CONTENT: 12,
  COOKIE_INSECURE: 10,
  COOKIE_NO_HTTPONLY: 6,
  COOKIE_NO_SAMESITE: 4,
  ADMIN_LINK: 8,
  NO_HSTS: 8,
  HSTS_WEAK: 4,
  NO_CSP: 8,
  CSP_WEAK: 6,
  CSP_REPORT_ONLY: 4,
  NO_FRAME_PROTECTION: 6,
  VISIBLE_MAPS_KEY: 6,
  LOGIN_FORM: 6,
  FILE_UPLOAD: 5,
  NO_NOSNIFF: 4,
  NO_REFERRER_POLICY: 3,
  NO_PERMISSIONS_POLICY: 2,
  SOURCEMAP: 2,
  HTML_TRUNCATED: 1,
};

function headerOf(headers: Record<string, string>, name: string): string | null {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want && value.trim()) return value.trim();
  }
  return null;
}

function unique(values: string[], max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function clip(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function maskToken(value: string): string {
  const clean = value.trim();
  if (clean.length <= 8) return `${clean.slice(0, 3)}…`;
  return `${clean.slice(0, 8)}…`;
}

function finding(input: Omit<SurfaceFinding, 'limit'> & { limit?: string }): SurfaceFinding {
  return {
    ...input,
    limit:
      input.limit ??
      'È solo ciò che la homepage pubblica mostra da sola. Non prova ingressi né controlli su altre pagine.',
  };
}

function attrOf(el: HTMLElement, name: string): string {
  return (el.getAttribute(name) ?? '').trim();
}

function stripScriptsAndStyles(root: HTMLElement): string {
  const clone = parseHtml(root.toString());
  for (const node of clone.querySelectorAll('script, style, noscript')) {
    node.remove();
  }
  return clone.textContent ?? '';
}

function detectPayment(html: string, root: HTMLElement): { signal: PaymentSignal; evidence: string | null } {
  const paymentField =
    /(?:cardnumber|card-number|card_number|cc-number|cc_number|ccnum|cc-num|numero[-_ ]?carta)/i;
  const exactName = /^(?:card|carta)$/i;
  for (const el of root.querySelectorAll('input, textarea, select')) {
    const name = attrOf(el, 'name');
    const id = attrOf(el, 'id');
    const autocomplete = attrOf(el, 'autocomplete');
    const placeholder = attrOf(el, 'placeholder');
    const hit =
      paymentField.test(name) ||
      paymentField.test(id) ||
      paymentField.test(placeholder) ||
      exactName.test(name) ||
      exactName.test(id) ||
      /cc-(?:number|csc|exp)/i.test(autocomplete);
    if (hit) {
      return { signal: 'own-form', evidence: clip(el.toString(), 120) };
    }
  }

  const lower = html.toLowerCase();
  for (const row of EXTERNAL_PAYMENTS) {
    if (row.needles.some((needle) => lower.includes(needle))) {
      return { signal: row.signal, evidence: null };
    }
  }
  return { signal: 'none', evidence: null };
}

function detectTechnologies(html: string, root: HTMLElement): DetectedTechnology[] {
  const found: DetectedTechnology[] = [];
  const lower = html.toLowerCase();
  const generator = root.querySelector('meta[name="generator"]');
  const generatorContent = generator ? attrOf(generator, 'content') : '';

  const rules: Array<{ test: boolean; name: string; evidence: string }> = [
    {
      test: Boolean(generatorContent),
      name: clip(generatorContent, 40) || 'Generatore',
      evidence: clip(generator?.toString() ?? generatorContent),
    },
    {
      test: lower.includes('wp-content') || /\/wp-(?:includes|json)\//i.test(html),
      name: 'WordPress',
      evidence: lower.includes('wp-content')
        ? 'In pagina c’è il percorso wp-content'
        : 'In pagina c’è un percorso tipico di WordPress',
    },
    {
      test: lower.includes('__next_data__') || lower.includes('_next/static'),
      name: 'Next.js',
      evidence: lower.includes('__next_data__')
        ? 'In pagina c’è il blocco __NEXT_DATA__'
        : 'In pagina c’è il percorso _next/static',
    },
    {
      test: lower.includes('cdn.shopify.com') || lower.includes('myshopify.com'),
      name: 'Shopify',
      evidence: 'In pagina c’è un riferimento a Shopify',
    },
    {
      test: lower.includes('wix.com') || lower.includes('wixstatic.com'),
      name: 'Wix',
      evidence: 'In pagina c’è un riferimento a Wix',
    },
    {
      test: lower.includes('squarespace'),
      name: 'Squarespace',
      evidence: 'In pagina c’è un riferimento a Squarespace',
    },
    {
      test: lower.includes('joomla'),
      name: 'Joomla',
      evidence: 'In pagina c’è un riferimento a Joomla',
    },
    {
      test: lower.includes('drupal'),
      name: 'Drupal',
      evidence: 'In pagina c’è un riferimento a Drupal',
    },
    {
      test: lower.includes('woocommerce'),
      name: 'WooCommerce',
      evidence: 'In pagina c’è un riferimento a WooCommerce',
    },
    {
      test: lower.includes('prestashop') || lower.includes('/modules/ps_'),
      name: 'PrestaShop',
      evidence: 'In pagina c’è un riferimento a PrestaShop',
    },
    {
      test: lower.includes('mage/cookies') || /\/static\/version\d+\/frontend\//i.test(html),
      name: 'Magento',
      evidence: 'In pagina c’è un riferimento a Magento',
    },
  ];

  for (const rule of rules) {
    if (!rule.test) continue;
    if (found.some((item) => item.name.toLowerCase() === rule.name.toLowerCase())) continue;
    found.push({ name: rule.name, evidence: rule.evidence });
  }
  return found.slice(0, 8);
}

function extractEmails(html: string, root: HTMLElement): string[] {
  const fromMailto = root
    .querySelectorAll('a[href^="mailto:"]')
    .map((el) => attrOf(el, 'href').replace(/^mailto:/i, '').split('?')[0] ?? '')
    .filter(Boolean);
  const fromText = stripScriptsAndStyles(root).match(EMAIL_RE) ?? [];
  const combined = [...fromMailto, ...fromText, ...(html.match(EMAIL_RE) ?? [])];
  return unique(
    combined.filter((email) => {
      const domain = email.split('@')[1]?.toLowerCase() ?? '';
      return !EMAIL_NOISE.some((noise) => domain === noise || domain.endsWith(`.${noise}`));
    }),
    8,
  );
}

function extractApiMentions(html: string): string[] {
  return unique((html.match(API_RE) ?? []).map((item) => clip(item, 80)), 12);
}

function extractGaIds(html: string): string[] {
  return unique([...(html.match(GA4_RE) ?? []), ...(html.match(UA_RE) ?? [])], 6);
}

function oldestCopyrightYear(visibleText: string, nowYear: number): number | null {
  let oldest: number | null = null;
  for (const match of visibleText.matchAll(COPYRIGHT_RE)) {
    const raw = match[1];
    if (!raw) continue;
    let year = Number(raw);
    if (year < 100) year += 2000;
    if (year < 1995 || year > nowYear) continue;
    if (oldest === null || year < oldest) oldest = year;
  }
  return oldest;
}

function hasValidFrameProtection(csp: string | null, xfo: string | null): boolean {
  if (xfo) {
    const value = xfo.trim().toUpperCase();
    return value === 'DENY' || value === 'SAMEORIGIN';
  }
  if (!csp) return false;
  return /frame-ancestors\s+[^;]+/i.test(csp) && !/frame-ancestors\s+\*/i.test(csp);
}

function cookieLines(headers: Record<string, string>): string[] {
  const raw = headerOf(headers, 'set-cookie');
  if (!raw) return [];
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCookieFlags(line: string): {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  sessionLike: boolean;
} {
  const parts = line.split(';').map((part) => part.trim());
  const name = parts[0]?.split('=')[0]?.trim() ?? '';
  const lower = line.toLowerCase();
  const sameSite = lower.match(/;\s*samesite=([^;]+)/i)?.[1]?.trim() ?? null;
  const sessionLike = /sess|auth|token|jwt|sid|login|phpSESSID|wordpress_logged_in/i.test(name);
  return {
    name,
    secure: /;\s*secure\b/i.test(line),
    httpOnly: /;\s*httponly\b/i.test(line),
    sameSite,
    sessionLike,
  };
}

function mixedLoadedUrls(root: HTMLElement, pageHttps: boolean): string[] {
  if (!pageHttps) return [];
  const found: string[] = [];
  const push = (url: string) => {
    if (!url || !/^http:\/\//i.test(url)) return;
    if (/schema\.org|w3\.org|xmlns|example\.com/i.test(url)) return;
    found.push(clip(url, 90));
  };

  for (const el of root.querySelectorAll('[src], [srcset], link[href][rel], iframe[src], object[data], embed[src], video[src], audio[src], source[src]')) {
    const tag = el.tagName.toLowerCase();
    const rel = attrOf(el, 'rel').toLowerCase();
    if (tag === 'a') continue;
    if (tag === 'link' && !/(stylesheet|preload|modulepreload|icon|manifest)/i.test(rel)) continue;
    push(attrOf(el, 'src'));
    push(attrOf(el, 'data'));
    const srcset = attrOf(el, 'srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        push(part.trim().split(/\s+/)[0] ?? '');
      }
    }
    if (tag === 'link') push(attrOf(el, 'href'));
  }

  for (const style of root.querySelectorAll('[style], style')) {
    const css = style.tagName.toLowerCase() === 'style' ? style.textContent ?? '' : attrOf(style, 'style');
    for (const match of css.matchAll(/url\(\s*['"]?(http:\/\/[^'")\s]+)['"]?\s*\)/gi)) {
      push(match[1] ?? '');
    }
  }

  return unique(found, 8);
}

function formHttpActions(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const form of root.querySelectorAll('form')) {
    const action = attrOf(form, 'action');
    if (/^http:\/\//i.test(action)) found.push(clip(action, 90));
  }
  return unique(found, 4);
}

function adminLinks(root: HTMLElement): { admin: string[]; pingback: string[] } {
  const admin: string[] = [];
  const pingback: string[] = [];
  for (const el of root.querySelectorAll('a[href], form[action], link[href]')) {
    const href = attrOf(el, 'href') || attrOf(el, 'action');
    if (!href) continue;
    if (/xmlrpc\.php/i.test(href)) {
      pingback.push(clip(href, 90));
      continue;
    }
    if (
      /(?:^|\/)wp-login\.php(?:$|[?#])/i.test(href) ||
      /(?:^|\/)wp-admin(?:\/|$|[?#])/i.test(href) ||
      /(?:^|\/)administrator(?:\/|$|[?#])/i.test(href) ||
      /(?:^|\/)user\/login(?:\/|$|[?#])/i.test(href)
    ) {
      admin.push(clip(href, 90));
    }
  }
  return { admin: unique(admin, 4), pingback: unique(pingback, 4) };
}

function visibleSecrets(html: string): Array<{ kind: 'secret' | 'maps'; sample: string }> {
  const out: Array<{ kind: 'secret' | 'maps'; sample: string }> = [];
  for (const match of html.matchAll(/\b(sk_live_[A-Za-z0-9]{8,})\b/g)) {
    out.push({ kind: 'secret', sample: maskToken(match[1] ?? '') });
  }
  for (const match of html.matchAll(/\b(ghp_[A-Za-z0-9]{20,})\b/g)) {
    out.push({ kind: 'secret', sample: maskToken(match[1] ?? '') });
  }
  for (const match of html.matchAll(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g)) {
    out.push({ kind: 'secret', sample: maskToken(match[1] ?? '') });
  }
  for (const match of html.matchAll(/\b(\d{8,12}:[A-Za-z0-9_-]{30,})\b/g)) {
    out.push({ kind: 'secret', sample: maskToken(match[1] ?? '') });
  }
  for (const match of html.matchAll(/\b(AIza[0-9A-Za-z\-_]{20,})\b/g)) {
    out.push({ kind: 'maps', sample: maskToken(match[1] ?? '') });
  }
  return out.slice(0, 6);
}

function generatorVersion(root: HTMLElement): string | null {
  const tag = root.querySelector('meta[name="generator"]');
  if (!tag) return null;
  const content = attrOf(tag, 'content');
  if (!content || !/\d/.test(content)) return null;
  return clip(content, 60);
}

function extractPhones(root: HTMLElement): string[] {
  const fromTel = root
    .querySelectorAll('a[href^="tel:"]')
    .map((el) => attrOf(el, 'href').replace(/^tel:/i, '').trim())
    .filter(Boolean);
  const visible = stripScriptsAndStyles(root);
  const matches = visible.match(/(?:\+39[\s.]?)?(?:3\d{2}[\s.]?\d{6,7}|0\d{1,3}[\s.]?\d{6,8})/g) ?? [];
  return unique(
    [...fromTel, ...matches]
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => {
        const digits = item.replace(/\D/g, '');
        return digits.length >= 9 && digits.length <= 12;
      }),
    6,
  );
}

function analyzeCsp(csp: string): { weak: boolean; evidence: string | null } {
  const lower = csp.toLowerCase();
  const reasons: string[] = [];
  if (/unsafe-inline/.test(lower)) reasons.push('unsafe-inline');
  if (/unsafe-eval/.test(lower)) reasons.push('unsafe-eval');
  if (/default-src\s+[^;]*\*/.test(lower) || /script-src\s+[^;]*\*/.test(lower)) {
    reasons.push('wildcard *');
  }
  return { weak: reasons.length > 0, evidence: reasons.length ? reasons.join(', ') : null };
}

function analyzeHsts(hsts: string | null): { on: boolean; weak: boolean; evidence: string | null } {
  if (!hsts) return { on: false, weak: false, evidence: null };
  if (/max-age\s*=\s*0\b/i.test(hsts)) return { on: false, weak: false, evidence: 'max-age=0' };
  const maxAge = Number(hsts.match(/max-age\s*=\s*(\d+)/i)?.[1] ?? '0');
  if (!Number.isFinite(maxAge) || maxAge <= 0) return { on: false, weak: false, evidence: hsts };
  if (maxAge < 15_552_000) return { on: true, weak: true, evidence: clip(hsts, 120) };
  return { on: true, weak: false, evidence: null };
}

function findSourceMapEvidence(root: HTMLElement, html: string): string | null {
  for (const script of root.querySelectorAll('script')) {
    const text = script.textContent ?? '';
    const match = text.match(/\/\/[#@]\s*sourceMappingURL=\s*(\S+)/i);
    if (match?.[1]) return clip(match[1], 80);
    const src = attrOf(script, 'src');
    if (/\.js\.map(?:$|[?#])/i.test(src)) return clip(src, 80);
  }
  const comment = html.match(/\/\/[#@]\s*sourceMappingURL=\s*(\S+)/i);
  return comment?.[1] ? clip(comment[1], 80) : null;
}

export function computeSurfaceScore(findings: SurfaceFinding[]): number {
  let score = 100;
  let headerHygiene = 0;
  const HEADER_CODES = new Set([
    'NO_HSTS',
    'HSTS_WEAK',
    'NO_CSP',
    'CSP_WEAK',
    'CSP_REPORT_ONLY',
    'NO_FRAME_PROTECTION',
    'NO_NOSNIFF',
    'NO_REFERRER_POLICY',
    'NO_PERMISSIONS_POLICY',
  ]);
  const scored = new Set<string>();
  const hasNoCsp = findings.some((item) => item.code === 'NO_CSP');

  for (const item of findings) {
    if (item.category === 'info') continue;
    if (scored.has(item.code)) continue;
    if (item.code === 'NO_FRAME_PROTECTION' && hasNoCsp) continue;
    scored.add(item.code);
    const delta = SCORE_DELTA[item.code] ?? 0;
    if (!delta) continue;
    if (HEADER_CODES.has(item.code)) {
      const room = Math.max(0, 28 - headerHygiene);
      const applied = Math.min(delta, room);
      headerHygiene += applied;
      score -= applied;
    } else {
      score -= delta;
    }
  }

  if (findings.some((item) => item.severity === 'HIGH' && item.category === 'problem')) {
    score = Math.min(score, 74);
  }
  return Math.max(0, Math.min(100, score));
}

export function analyzeSurfacePage(
  input: SurfaceAnalysisInput,
  now: Date = new Date(),
): SurfaceAnalysis {
  const root = parseHtml(input.html || '');
  const finalHttps = isHttps(input.finalUrl);
  const hstsRaw = headerOf(input.headers, 'strict-transport-security');
  const hstsInfo = analyzeHsts(hstsRaw);
  const csp = headerOf(input.headers, 'content-security-policy');
  const cspReport = headerOf(input.headers, 'content-security-policy-report-only');
  const cspQuality = csp ? analyzeCsp(csp) : { weak: false, evidence: null };
  const xfo = headerOf(input.headers, 'x-frame-options');
  const nosniffRaw = headerOf(input.headers, 'x-content-type-options');
  const nosniff = Boolean(nosniffRaw && /nosniff/i.test(nosniffRaw));
  const referrer = headerOf(input.headers, 'referrer-policy');
  const permissions = headerOf(input.headers, 'permissions-policy') ?? headerOf(input.headers, 'feature-policy');
  const cookies = cookieLines(input.headers).map(parseCookieFlags);
  const insecureCookies = cookies.filter((row) => finalHttps && !row.secure);
  const sessionCookies = cookies.filter((row) => row.sessionLike);
  const noHttpOnlySession = sessionCookies.filter((row) => finalHttps && !row.httpOnly);
  const noSameSiteSession = sessionCookies.filter((row) => finalHttps && !row.sameSite);
  const htmlTruncated = Boolean(input.htmlTruncated);
  const redirectChain = input.redirectChain ?? [];
  const statusOk = input.httpStatus >= 200 && input.httpStatus < 400;
  const emptyBody = !input.html.trim();

  const checklist: HeaderChecklist = {
    https: finalHttps,
    hsts: finalHttps ? hstsInfo.on : null,
    csp: !csp ? (cspReport ? 'report-only' : 'missing') : cspQuality.weak ? 'weak' : 'present',
    frameProtection: hasValidFrameProtection(csp, xfo),
    nosniff,
    referrerPolicy: Boolean(referrer),
    permissionsPolicy: Boolean(permissions),
    cookieSecure: cookies.length ? insecureCookies.length === 0 : null,
    cookieHttpOnly: sessionCookies.length ? noHttpOnlySession.length === 0 : null,
    cookieSameSite: sessionCookies.length ? noSameSiteSession.length === 0 : null,
  };

  const technologies = detectTechnologies(input.html, root);
  const emailsFound = extractEmails(input.html, root);
  const apiMentions = extractApiMentions(input.html);
  const gaIds = extractGaIds(input.html);
  const paymentInfo = detectPayment(input.html, root);
  const payment = paymentInfo.signal;
  const findings: SurfaceFinding[] = [];
  const visibleText = stripScriptsAndStyles(root);

  if (!statusOk || emptyBody) {
    findings.push(
      finding({
        code: 'HOMEPAGE_ERROR',
        severity: 'HIGH',
        category: 'problem',
        confidence: 'confirmed',
        title: emptyBody ? 'La homepage non ha restituito contenuto' : 'La homepage non ha risposto come una pagina normale',
        detail: emptyBody
          ? 'La risposta è vuota. Non si può giudicare la pagina da fuori.'
          : `Il server ha risposto con stato ${input.httpStatus}. Non è una homepage utilizzabile.`,
        evidence: emptyBody ? 'body vuoto' : `HTTP ${input.httpStatus}`,
        limit: 'Non dice se altre pagine funzionano. Dice solo che questa risposta non è una homepage valida.',
      }),
    );
  }

  if (htmlTruncated) {
    findings.push(
      finding({
        code: 'HTML_TRUNCATED',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'La pagina è molto lunga: ho letto solo la parte iniziale',
        detail: 'Il contenuto scaricato è stato limitato. Alcune cose in fondo alla pagina possono non comparire qui.',
        evidence: 'HTML troncato al limite di lettura',
      }),
    );
  }

  if (!finalHttps) {
    findings.push(
      finding({
        code: 'NO_HTTPS',
        severity: 'HIGH',
        category: 'problem',
        confidence: 'confirmed',
        title: 'La pagina si apre senza lucchetto',
        detail: 'L’indirizzo finale è in http, non in https. Un visitatore vede la pagina senza connessione cifrata.',
        evidence: input.finalUrl,
      }),
    );
  }

  if (payment === 'own-form' && paymentInfo.evidence) {
    findings.push(
      finding({
        code: 'CARD_FORM_OWN',
        severity: 'HIGH',
        category: 'problem',
        confidence: 'confirmed',
        title: 'In pagina c’è un modulo per i dati della carta',
        detail:
          'Un campo per il numero di carta compare direttamente nell’HTML del sito. Il semplice caricamento di Stripe o di un altro fornitore non dimostra che quel campo sia isolato.',
        evidence: paymentInfo.evidence,
        limit:
          'Non abbiamo inviato dati. Serve il controllo autorizzato per vedere su quali pagine compare e una verifica tecnica del flusso lato server.',
      }),
    );
  }

  const httpForms = formHttpActions(root);
  if (httpForms.length > 0) {
    findings.push(
      finding({
        code: 'FORM_TO_HTTP',
        severity: 'HIGH',
        category: 'problem',
        confidence: 'confirmed',
        title: 'Un modulo manda i dati senza lucchetto',
        detail: 'Il modulo della pagina pubblica invia verso un indirizzo http, non https.',
        evidence: httpForms[0] ?? 'action=http://…',
      }),
    );
  }

  const mixed = mixedLoadedUrls(root, finalHttps);
  if (mixed.length > 0) {
    findings.push(
      finding({
        code: 'MIXED_CONTENT',
        severity: 'MEDIUM',
        category: 'problem',
        confidence: 'confirmed',
        title: 'La pagina con lucchetto carica pezzi senza lucchetto',
        detail: 'L’indirizzo è https, ma in pagina ci sono risorse caricate in http (script, stili, immagini o iframe).',
        evidence: mixed.slice(0, 2).join(', '),
        limit: 'Un semplice link http verso un altro sito non conta: qui si tratta di risorse che la pagina carica.',
      }),
    );
  }

  if (insecureCookies.length > 0) {
    findings.push(
      finding({
        code: 'COOKIE_INSECURE',
        severity: 'MEDIUM',
        category: 'problem',
        confidence: 'confirmed',
        title: 'Il sito lascia un cookie senza la regola Secure',
        detail: 'Nella risposta c’è un cookie senza Secure, su una pagina https.',
        evidence: insecureCookies
          .slice(0, 3)
          .map((row) => row.name)
          .join(', '),
      }),
    );
  }

  if (noHttpOnlySession.length > 0) {
    findings.push(
      finding({
        code: 'COOKIE_NO_HTTPONLY',
        severity: 'MEDIUM',
        category: 'protection',
        confidence: 'likely',
        title: 'Un cookie di sessione non ha HttpOnly',
        detail: 'C’è un cookie che sembra di sessione senza HttpOnly. Lo script della pagina potrebbe leggerlo.',
        evidence: noHttpOnlySession
          .slice(0, 3)
          .map((row) => row.name)
          .join(', '),
        limit: 'Dal nome del cookie si deduce che può essere di sessione. Non apre la sessione da solo.',
      }),
    );
  }

  if (noSameSiteSession.length > 0) {
    findings.push(
      finding({
        code: 'COOKIE_NO_SAMESITE',
        severity: 'LOW',
        category: 'protection',
        confidence: 'likely',
        title: 'Un cookie di sessione non dichiara SameSite',
        detail:
          'C’è un cookie che sembra di sessione senza SameSite. Il browser ha meno istruzioni su quando inviarlo da altri siti.',
        evidence: noSameSiteSession
          .slice(0, 3)
          .map((row) => row.name)
          .join(', '),
        limit:
          'Il nome fa pensare a una sessione, ma dalla sola risposta non possiamo sapere esattamente come viene usato.',
      }),
    );
  }

  const secrets = visibleSecrets(input.html);
  const secretSamples = secrets.filter((item) => item.kind === 'secret').map((item) => item.sample);
  const mapsSamples = secrets.filter((item) => item.kind === 'maps').map((item) => item.sample);
  if (secretSamples.length > 0) {
    findings.push(
      finding({
        code: 'VISIBLE_SECRET',
        severity: 'HIGH',
        category: 'problem',
        confidence: 'confirmed',
        title: 'In pagina si vede una chiave che non dovrebbe essere pubblica',
        detail: 'Nel codice della pagina pubblica c’è una chiave (troncata qui). Non è una prova di furti già avvenuti.',
        evidence: secretSamples.join(', '),
      }),
    );
  }
  if (mapsSamples.length > 0) {
    findings.push(
      finding({
        code: 'VISIBLE_MAPS_KEY',
        severity: 'MEDIUM',
        category: 'info',
        confidence: 'info',
        title: 'In pagina si vede una chiave Google Maps',
        detail: 'La chiave è scritta nel codice della pagina. Molti siti la mettono così: resta visibile a chi apre il codice.',
        evidence: mapsSamples.join(', '),
        limit: 'Non prova che la chiave sia abusabile: dipende dai limiti impostati su Google.',
      }),
    );
  }

  const links = adminLinks(root);
  if (links.admin.length > 0) {
    findings.push(
      finding({
        code: 'ADMIN_LINK',
        severity: 'MEDIUM',
        category: 'info',
        confidence: 'info',
        title: 'In pagina c’è un link alla zona di accesso',
        detail: 'Nella homepage pubblica compare un indirizzo di login o amministrazione. Non abbiamo aperto quella pagina.',
        evidence: links.admin[0] ?? '',
        limit: 'Mostra solo dove si vede il link. Non prova che l’accesso sia debole o aperto.',
      }),
    );
  }
  if (links.pingback.length > 0) {
    findings.push(
      finding({
        code: 'WP_PINGBACK',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'WordPress dichiara xmlrpc.php (pingback)',
        detail: 'In homepage compare un riferimento a xmlrpc.php, tipico dei pingback WordPress. Non è il pannello di amministrazione.',
        evidence: links.pingback[0] ?? '',
        limit: 'Non abbiamo chiamato xmlrpc.php. Non prova un ingresso né un attacco riuscito.',
      }),
    );
  }

  if (root.querySelector('input[type="password"]')) {
    findings.push(
      finding({
        code: 'LOGIN_FORM',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina c’è un campo per la password',
        detail: 'Sulla pagina pubblica si vede un modulo di accesso. È solo quello che c’è scritto, non un ingresso forzato.',
        evidence: 'Nel codice c’è un campo type="password".',
      }),
    );
  }

  if (root.querySelector('input[type="file"]')) {
    findings.push(
      finding({
        code: 'FILE_UPLOAD',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina si può caricare un file',
        detail: 'C’è un campo per inviare un file dalla pagina pubblica.',
        evidence: 'Nel codice c’è un campo type="file".',
      }),
    );
  }

  const server = headerOf(input.headers, 'server');
  const powered = headerOf(input.headers, 'x-powered-by');
  const banner = [server, powered].filter((item): item is string => Boolean(item && /\d+\.\d+/.test(item)));
  if (banner.length > 0) {
    findings.push(
      finding({
        code: 'SERVER_BANNER',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'Il sito dice che programma e versione usa il server',
        detail: 'Nella risposta compare il nome e il numero di versione. È solo un’etichetta, non una prova di ingresso.',
        evidence: banner.map((item) => clip(item, 80)).join(' · '),
      }),
    );
  }

  const generator = generatorVersion(root);
  if (generator && technologies.some((item) => /wordpress|joomla|drupal|woocommerce|shopify|wix|magento|prestashop/i.test(item.name))) {
    findings.push(
      finding({
        code: 'GENERATOR_VERSION',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina è scritta la versione del sito',
        detail: `Si legge «${generator}». È quello che il sito pubblica da sola, non un controllo su aggiornamenti.`,
        evidence: generator,
        limit: 'Da qui si vede solo la versione dichiarata. Non prova se i buchi noti sono ancora aperti.',
      }),
    );
  }

  const sourcemap = findSourceMapEvidence(root, input.html);
  if (sourcemap) {
    findings.push(
      finding({
        code: 'SOURCEMAP',
        severity: 'LOW',
        category: 'info',
        confidence: 'likely',
        title: 'In pagina c’è un riferimento a una mappa del codice',
        detail: 'Compare un sourceMappingURL o un file .map in uno script. Serve agli sviluppatori.',
        evidence: sourcemap,
      }),
    );
  }

  if (finalHttps && !hstsInfo.on) {
    findings.push(
      finding({
        code: 'NO_HSTS',
        severity: 'MEDIUM',
        category: 'protection',
        confidence: 'confirmed',
        title: 'Il sito non chiede al browser di restare su https',
        detail: 'Manca l’intestazione Strict-Transport-Security. Il lucchetto c’è adesso, ma il browser non è obbligato a usarlo la volta dopo.',
        evidence: hstsInfo.evidence ?? 'Nella risposta non c’è Strict-Transport-Security (oppure max-age è 0).',
      }),
    );
  } else if (finalHttps && hstsInfo.weak) {
    findings.push(
      finding({
        code: 'HSTS_WEAK',
        severity: 'LOW',
        category: 'protection',
        confidence: 'confirmed',
        title: 'La regola HSTS dura troppo poco',
        detail:
          'Strict-Transport-Security c’è, ma max-age è sotto 180 giorni. Il browser ricorda il lucchetto per un periodo breve.',
        evidence: hstsInfo.evidence ?? hstsRaw ?? '',
      }),
    );
  }

  if (checklist.csp === 'missing') {
    findings.push(
      finding({
        code: 'NO_CSP',
        severity: 'MEDIUM',
        category: 'protection',
        confidence: 'confirmed',
        title: 'Il sito non dice al browser quali script può eseguire',
        detail: 'Manca l’intestazione Content-Security-Policy. Non è una prova di intrusioni: è solo assente questa regola.',
        evidence: 'Nella risposta non c’è Content-Security-Policy.',
      }),
    );
  } else if (checklist.csp === 'report-only') {
    findings.push(
      finding({
        code: 'CSP_REPORT_ONLY',
        severity: 'LOW',
        category: 'protection',
        confidence: 'confirmed',
        title: 'La regola sugli script è solo di segnalazione',
        detail: 'C’è Content-Security-Policy-Report-Only: il browser registra, non blocca.',
        evidence: clip(cspReport ?? '', 160),
      }),
    );
  } else if (checklist.csp === 'weak' && cspQuality.evidence) {
    findings.push(
      finding({
        code: 'CSP_WEAK',
        severity: 'MEDIUM',
        category: 'protection',
        confidence: 'confirmed',
        title: 'La regola CSP è presente ma troppo larga',
        detail: 'Content-Security-Policy c’è, però consente pratiche larghe come script inline o wildcard.',
        evidence: cspQuality.evidence,
      }),
    );
  }

  if (!checklist.frameProtection && !findings.some((item) => item.code === 'NO_CSP')) {
    findings.push(
      finding({
        code: 'NO_FRAME_PROTECTION',
        severity: 'MEDIUM',
        category: 'protection',
        confidence: 'confirmed',
        title: 'La pagina non vieta di essere messa dentro un’altra pagina',
        detail: 'Mancano X-Frame-Options validi e frame-ancestors. Il sito non chiede al browser questa protezione.',
        evidence: xfo ? `X-Frame-Options: ${clip(xfo, 40)}` : 'Nella risposta non ci sono X-Frame-Options né frame-ancestors.',
      }),
    );
  }

  if (!nosniff) {
    findings.push(
      finding({
        code: 'NO_NOSNIFF',
        severity: 'LOW',
        category: 'protection',
        confidence: 'confirmed',
        title: 'Manca la regola nosniff',
        detail: 'Il sito non dice al browser di rispettare il tipo di file dichiarato (X-Content-Type-Options: nosniff).',
        evidence: 'Nella risposta non c’è X-Content-Type-Options: nosniff.',
      }),
    );
  }

  if (finalHttps && !referrer) {
    findings.push(
      finding({
        code: 'NO_REFERRER_POLICY',
        severity: 'LOW',
        category: 'protection',
        confidence: 'confirmed',
        title: 'Manca la regola sul referrer',
        detail: 'Non c’è Referrer-Policy. Il browser può mandare all’altro sito più dettagli sull’indirizzo di partenza.',
        evidence: 'Nella risposta non c’è Referrer-Policy.',
      }),
    );
  }

  if (finalHttps && !permissions) {
    findings.push(
      finding({
        code: 'NO_PERMISSIONS_POLICY',
        severity: 'LOW',
        category: 'protection',
        confidence: 'confirmed',
        title: 'Manca Permissions-Policy',
        detail: 'Non c’è Permissions-Policy. Il sito non limita funzioni del browser come fotocamera o posizione.',
        evidence: 'Nella risposta non c’è Permissions-Policy.',
      }),
    );
  }

  if (emailsFound.length > 0) {
    findings.push(
      finding({
        code: 'EMAILS_VISIBLE',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina si vede almeno un indirizzo email',
        detail: 'L’indirizzo è scritto nella pagina pubblica. Non è una prova che la casella sia stata violata.',
        evidence: emailsFound.slice(0, 3).join(', '),
        limit: 'È un recapito pubblico. Non abbassa il punteggio di sicurezza.',
      }),
    );
  }

  const phonesFound = extractPhones(root);
  if (phonesFound.length > 0) {
    findings.push(
      finding({
        code: 'PHONES_VISIBLE',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina si vede un numero di telefono',
        detail: 'Il numero è scritto nella pagina pubblica o in un link tel:. Non è una prova di accessi.',
        evidence: phonesFound.slice(0, 3).join(', '),
        limit: 'Non contiamo i numeri dentro gli script. Non abbassa il punteggio.',
      }),
    );
  }

  const year = oldestCopyrightYear(visibleText, now.getFullYear());
  if (
    year !== null &&
    year <= now.getFullYear() - 4 &&
    technologies.some((item) => /wordpress|joomla|drupal/i.test(item.name))
  ) {
    const cms = technologies.find((item) => /wordpress|joomla|drupal/i.test(item.name));
    findings.push(
      finding({
        code: 'OLD_COPYRIGHT',
        severity: 'LOW',
        category: 'info',
        confidence: 'info',
        title: 'In pagina compare un anno vecchio',
        detail: `Si vede © ${year}${cms ? ` e un riferimento a ${cms.name}` : ''}. È solo la data scritta in pagina.`,
        evidence: `© ${year}`,
        limit: 'Un anno vecchio da solo non prova che il sito sia fermo o vulnerabile.',
      }),
    );
  }

  return {
    score: computeSurfaceScore(findings),
    headers: checklist,
    technologies,
    findings,
    emailsFound,
    apiMentions,
    gaIds,
    payment,
    httpStatus: input.httpStatus,
    htmlTruncated,
    redirectChain,
  };
}

export function scoreBand(score: number): 'red' | 'orange' | 'green' {
  if (score > 75) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

export function scoreBandLabel(score: number): string {
  const band = scoreBand(score);
  if (band === 'green') return 'Poche cose da sistemare da fuori';
  if (band === 'orange') return 'Diverse cose da sistemare o proteggere';
  return 'Diverse cose importanti da sistemare';
}

export function findingsByCategory(findings: SurfaceFinding[]): {
  problems: SurfaceFinding[];
  protections: SurfaceFinding[];
  infos: SurfaceFinding[];
} {
  return {
    problems: findings.filter((item) => item.category === 'problem'),
    protections: findings.filter((item) => item.category === 'protection'),
    infos: findings.filter((item) => item.category === 'info'),
  };
}

/** Costruisce il finding BAD_CERT con lo stesso modello di score. */
export function badCertAnalysis(message: string): SurfaceAnalysis {
  const findings: SurfaceFinding[] = [
    finding({
      code: 'BAD_CERT',
      severity: 'HIGH',
      category: 'problem',
      confidence: 'confirmed',
      title: 'Il lucchetto della pagina non è accettato',
      detail: 'Aprendo la pagina pubblica, il certificato non è valido. Non è una prova di furti già avvenuti.',
      evidence: message,
    }),
  ];
  return {
    score: computeSurfaceScore(findings),
    headers: {
      https: true,
      hsts: null,
      csp: 'missing',
      frameProtection: false,
      nosniff: false,
      referrerPolicy: false,
      permissionsPolicy: false,
      cookieSecure: null,
      cookieHttpOnly: null,
      cookieSameSite: null,
    },
    technologies: [],
    findings,
    emailsFound: [],
    apiMentions: [],
    gaIds: [],
    payment: 'none',
    httpStatus: 0,
    htmlTruncated: false,
    redirectChain: [],
  };
}
