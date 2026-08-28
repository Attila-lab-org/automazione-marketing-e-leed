export type WebsiteSnapshot = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  headings: string[];
  ctas: string[];
  emails: string[];
  phones: string[];
  bookingSignals: string[];
  bookingUrl: string | null;
  hasViewportMeta: boolean;
  usesHttps: boolean;
  textExcerpt: string;
  retrieved: boolean;
  blockedReason: string | null;
};

const CTA_WORDS = [
  'prenota',
  'prenotazione',
  'contatt',
  'menu',
  'ordina',
  'whatsapp',
  'chiama',
  'scopri',
  'book',
];

const BOOKING_WORDS = ['thefork', 'quandoo', 'opentable', 'prenota online', 'prenotazione'];
const BOOKING_HREF = /thefork|quandoo|opentable|resy|covermanager|prenota/i;

function resolveHref(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractBookingUrl(html: string, baseUrl: string): string | null {
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? '';
    const label = stripTags(match[2] ?? '');
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1]?.trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (BOOKING_HREF.test(href) || BOOKING_HREF.test(label)) {
      const resolved = resolveHref(href, baseUrl);
      if (resolved) return resolved;
    }
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAll(html: string, re: RegExp): string[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  const out: string[] = [];
  for (const match of html.matchAll(global)) {
    const value = match[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (value) out.push(value.slice(0, 160));
  }
  return [...new Set(out)].slice(0, 12);
}

export function extractWebsiteSnapshot(url: string, html: string | null, blockedReason?: string): WebsiteSnapshot {
  const usesHttps = url.toLowerCase().startsWith('https://');
  if (!html) {
    return {
      url,
      finalUrl: url,
      title: null,
      description: null,
      headings: [],
      ctas: [],
      emails: [],
      phones: [],
      bookingSignals: [],
      bookingUrl: null,
      hasViewportMeta: false,
      usesHttps,
      textExcerpt: '',
      retrieved: false,
      blockedReason: blockedReason ?? 'html_unavailable',
    };
  }

  const title = matchAll(html, /<title[^>]*>([\s\S]*?)<\/title>/i)[0] ?? null;
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
    null;
  const headings = [
    ...matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
    ...matchAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
  ];
  const linkTexts = matchAll(html, /<a[^>]*>([\s\S]*?)<\/a>/gi);
  const ctas = linkTexts.filter((t) => CTA_WORDS.some((w) => t.toLowerCase().includes(w)));
  const text = stripTags(html).slice(0, 8000);
  const lower = `${html}\n${text}`.toLowerCase();
  const bookingSignals = BOOKING_WORDS.filter((w) => lower.includes(w));
  const emails = [...new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))].slice(0, 8);
  const phones = [...new Set((html.match(/\+?\d[\d\s().-]{7,}\d/g) ?? []).map((p) => p.trim()))].slice(0, 6);

  return {
    url,
    finalUrl: url,
    title,
    description,
    headings,
    ctas,
    emails,
    phones,
    bookingSignals,
    bookingUrl: extractBookingUrl(html, url),
    hasViewportMeta: /name=["']viewport["']/i.test(html),
    usesHttps,
    textExcerpt: text,
    retrieved: true,
    blockedReason: null,
  };
}

export function snapshotCorpus(snapshot: WebsiteSnapshot): string {
  return [
    snapshot.url,
    snapshot.title,
    snapshot.description,
    snapshot.headings.join(' '),
    snapshot.ctas.join(' '),
    snapshot.bookingSignals.join(' '),
    snapshot.bookingUrl,
    snapshot.textExcerpt,
  ]
    .filter(Boolean)
    .join('\n');
}
