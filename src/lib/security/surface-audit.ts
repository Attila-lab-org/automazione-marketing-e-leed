/**
 * Analisi della sola pagina pubblica già scaricata.
 * Nessuna ipotesi: ogni voce ha una prova presa da intestazioni o HTML.
 */

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type SurfaceFinding = {
  code: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: string;
};

export type HeaderChecklist = {
  https: boolean;
  hsts: boolean | null;
  csp: 'present' | 'report-only' | 'missing';
  frameProtection: boolean;
  nosniff: boolean;
};

export type DetectedTechnology = {
  name: string;
  evidence: string;
};

export type PaymentSignal = 'stripe' | 'paypal' | 'satispay' | 'own-form' | 'none';

export type SurfaceAnalysisInput = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: Record<string, string>;
  html: string;
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

function detectPayment(html: string): PaymentSignal {
  const lower = html.toLowerCase();
  if (
    lower.includes('js.stripe.com') ||
    lower.includes('checkout.stripe.com') ||
    /stripe\.com\/(?:v3|docs)/.test(lower) ||
    /\bstripe\s*\(/.test(lower)
  ) {
    return 'stripe';
  }
  if (lower.includes('paypal.com') || lower.includes('paypalobjects.com')) {
    return 'paypal';
  }
  if (lower.includes('satispay')) return 'satispay';

  const hasCardField =
    /name=["'][^"']*(card|carta|cc-number|cardnumber|numero[-_ ]?carta)[^"']*["']/i.test(html) ||
    /autocomplete=["']cc-number["']/i.test(html) ||
    /placeholder=["'][^"']*(numero (della )?carta|card number)[^"']*["']/i.test(html);
  return hasCardField ? 'own-form' : 'none';
}

function detectTechnologies(html: string): DetectedTechnology[] {
  const found: DetectedTechnology[] = [];
  const lower = html.toLowerCase();
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]*>/i)?.[0] ?? '';
  const generatorContent =
    generator.match(/content=["']([^"']+)["']/i)?.[1] ??
    generator.match(/content=([^\s>]+)/i)?.[1] ??
    '';

  const rules: Array<{ test: boolean; name: string; evidence: string }> = [
    {
      test: Boolean(generatorContent),
      name: clip(generatorContent, 40) || 'Generatore',
      evidence: clip(generator),
    },
    {
      test: lower.includes('wp-content') || lower.includes('wordpress'),
      name: 'WordPress',
      evidence: lower.includes('wp-content') ? 'In pagina c’è il percorso wp-content' : 'In pagina compare la parola WordPress',
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
  ];

  for (const rule of rules) {
    if (!rule.test) continue;
    if (found.some((item) => item.name.toLowerCase() === rule.name.toLowerCase())) continue;
    found.push({ name: rule.name, evidence: rule.evidence });
  }
  return found.slice(0, 8);
}

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_RE) ?? [];
  return unique(
    matches.filter((email) => {
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

function oldestCopyrightYear(html: string, nowYear: number): number | null {
  let oldest: number | null = null;
  for (const match of html.matchAll(COPYRIGHT_RE)) {
    const raw = match[1];
    if (!raw) continue;
    let year = Number(raw);
    if (year < 100) year += 2000;
    if (year < 1995 || year > nowYear) continue;
    if (oldest === null || year < oldest) oldest = year;
  }
  return oldest;
}

function hasFrameProtection(csp: string | null, xfo: string | null): boolean {
  if (xfo) return true;
  if (!csp) return false;
  return /frame-ancestors/i.test(csp);
}

export function analyzeSurfacePage(
  input: SurfaceAnalysisInput,
  now: Date = new Date(),
): SurfaceAnalysis {
  const finalHttps = isHttps(input.finalUrl);
  const hsts = headerOf(input.headers, 'strict-transport-security');
  const csp = headerOf(input.headers, 'content-security-policy');
  const cspReport = headerOf(input.headers, 'content-security-policy-report-only');
  const xfo = headerOf(input.headers, 'x-frame-options');
  const nosniffRaw = headerOf(input.headers, 'x-content-type-options');
  const nosniff = Boolean(nosniffRaw && /nosniff/i.test(nosniffRaw));
  const hstsOn = Boolean(hsts && !/max-age\s*=\s*0\b/i.test(hsts));

  const checklist: HeaderChecklist = {
    https: finalHttps,
    hsts: finalHttps ? hstsOn : null,
    csp: csp ? 'present' : cspReport ? 'report-only' : 'missing',
    frameProtection: hasFrameProtection(csp, xfo),
    nosniff,
  };

  const technologies = detectTechnologies(input.html);
  const emailsFound = extractEmails(input.html);
  const apiMentions = extractApiMentions(input.html);
  const gaIds = extractGaIds(input.html);
  const payment = detectPayment(input.html);
  const findings: SurfaceFinding[] = [];

  if (!finalHttps) {
    findings.push({
      code: 'NO_HTTPS',
      severity: 'HIGH',
      title: 'La pagina si apre senza lucchetto',
      detail: 'L’indirizzo finale è in http, non in https. Un visitatore vede la pagina senza connessione cifrata.',
      evidence: input.finalUrl,
    });
  }

  if (payment === 'own-form') {
    findings.push({
      code: 'CARD_FORM_OWN',
      severity: 'HIGH',
      title: 'In pagina c’è un modulo per i dati della carta',
      detail: 'Si vede un campo per il numero di carta sul loro sito, non un pagamento Stripe, PayPal o Satispay.',
      evidence: 'Nel codice della pagina c’è un campo collegato a carta / card number.',
    });
  }

  if (finalHttps && !hstsOn) {
    findings.push({
      code: 'NO_HSTS',
      severity: 'MEDIUM',
      title: 'Il sito non chiede al browser di restare su https',
      detail: 'Manca l’intestazione Strict-Transport-Security. Il lucchetto c’è adesso, ma il browser non è obbligato a usarlo la volta dopo.',
      evidence: 'Nella risposta non c’è Strict-Transport-Security (oppure max-age è 0).',
    });
  }

  if (checklist.csp === 'missing') {
    findings.push({
      code: 'NO_CSP',
      severity: 'MEDIUM',
      title: 'Il sito non dice al browser quali script può eseguire',
      detail: 'Manca l’intestazione Content-Security-Policy. Non è una prova di intrusioni: è solo assente questa regola.',
      evidence: 'Nella risposta non c’è Content-Security-Policy.',
    });
  } else if (checklist.csp === 'report-only') {
    findings.push({
      code: 'CSP_REPORT_ONLY',
      severity: 'LOW',
      title: 'La regola sugli script è solo di segnalazione',
      detail: 'C’è Content-Security-Policy-Report-Only: il browser registra, non blocca.',
      evidence: clip(cspReport ?? '', 160),
    });
  }

  if (!checklist.frameProtection) {
    findings.push({
      code: 'NO_FRAME_PROTECTION',
      severity: 'MEDIUM',
      title: 'La pagina non vieta di essere messa dentro un’altra pagina',
      detail: 'Mancano X-Frame-Options e frame-ancestors. Il sito non chiede al browser questa protezione.',
      evidence: 'Nella risposta non ci sono X-Frame-Options né frame-ancestors.',
    });
  }

  if (!nosniff) {
    findings.push({
      code: 'NO_NOSNIFF',
      severity: 'LOW',
      title: 'Manca la regola nosniff',
      detail: 'Il sito non dice al browser di rispettare il tipo di file dichiarato (X-Content-Type-Options: nosniff).',
      evidence: 'Nella risposta non c’è X-Content-Type-Options: nosniff.',
    });
  }

  if (emailsFound.length > 0) {
    findings.push({
      code: 'EMAILS_VISIBLE',
      severity: 'LOW',
      title: 'In pagina si vede almeno un indirizzo email',
      detail: 'L’indirizzo è scritto nel codice della pagina pubblica. Non è una prova che la casella sia stata violata.',
      evidence: emailsFound.slice(0, 3).join(', '),
    });
  }

  const year = oldestCopyrightYear(input.html, now.getFullYear());
  if (year !== null && year <= now.getFullYear() - 4) {
    const generator = technologies.find((item) => /wordpress|joomla|drupal/i.test(item.name));
    findings.push({
      code: 'OLD_COPYRIGHT',
      severity: 'LOW',
      title: 'In pagina compare un anno vecchio',
      detail: generator
        ? `Si vede © ${year} e un riferimento a ${generator.name}. È solo quello che c’è scritto, non una prova di falle.`
        : `Si vede © ${year}. È solo la data scritta in pagina, non una prova di falle.`,
      evidence: `© ${year}`,
    });
  }

  let score = 100;
  for (const finding of findings) {
    if (finding.code === 'NO_HTTPS') score -= 25;
    else if (finding.code === 'CARD_FORM_OWN') score -= 20;
    else if (finding.code === 'NO_HSTS') score -= 8;
    else if (finding.code === 'NO_CSP') score -= 8;
    else if (finding.code === 'CSP_REPORT_ONLY') score -= 4;
    else if (finding.code === 'NO_FRAME_PROTECTION') score -= 6;
    else if (finding.code === 'NO_NOSNIFF') score -= 4;
    else if (finding.code === 'EMAILS_VISIBLE') score -= 3;
    else if (finding.code === 'OLD_COPYRIGHT') score -= 5;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    headers: checklist,
    technologies,
    findings,
    emailsFound,
    apiMentions,
    gaIds,
    payment,
  };
}

export function scoreBand(score: number): 'red' | 'orange' | 'green' {
  if (score > 75) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

export function scoreBandLabel(score: number): string {
  const band = scoreBand(score);
  if (band === 'green') return 'Poche cose visibili da fuori';
  if (band === 'orange') return 'Diverse cose visibili da fuori';
  return 'Molte cose visibili da fuori';
}
