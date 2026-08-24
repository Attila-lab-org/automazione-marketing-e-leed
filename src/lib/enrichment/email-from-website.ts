export interface EmailEnrichmentResult {
  email: string | null;
  sourceUrl: string | null;
  sourceType: 'mailto' | 'page_text' | null;
  status: 'FOUND' | 'NOT_FOUND' | 'NO_WEBSITE' | 'ERROR' | 'BLOCKED_URL' | 'ALREADY_PRESENT';
  candidates: string[];
  confidence: number;
}

export interface EmailEnrichmentProvider {
  enrichFromWebsite(websiteUrl: string): Promise<EmailEnrichmentResult>;
}

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

function normalizeDomain(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isPrivateIp(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === '::1' || hostname === '0.0.0.0') return true;
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** SSRF gate: only public http(s), no private/link-local/metadata. */
export function assertSafePublicUrl(raw: string): URL {
  const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BLOCKED_URL: schema non consentito');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('BLOCKED_URL: host non consentito');
  }
  if (isPrivateIp(host)) {
    throw new Error('BLOCKED_URL: IP privato/link-local');
  }
  return url;
}

function extractEmails(html: string): { emails: string[]; mailto: string[] } {
  const found = new Set<string>();
  const mailto = new Set<string>();
  for (const match of html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const e = normalizeEmail(match[1]!);
    found.add(e);
    mailto.add(e);
  }
  for (const match of html.matchAll(EMAIL_REGEX)) {
    found.add(normalizeEmail(match[0]!));
  }
  return { emails: [...found], mailto: [...mailto] };
}

function rankEmails(emails: string[], domain: string | null, mailto: Set<string>): string[] {
  const developerHints = ['wix', 'squarespace', 'wordpress', 'webflow', 'godaddy', 'shopify'];
  return [...emails].sort((a, b) => {
    const score = (e: string) => {
      let s = 10;
      if (domain && e.endsWith(`@${domain}`)) s -= 5;
      if (mailto.has(e)) s -= 3;
      if (/^(info|contact|contatti|hello|prenotazioni|booking)@/.test(e)) s -= 2;
      if (developerHints.some((h) => e.includes(h))) s += 8;
      if (domain && !e.endsWith(`@${domain}`)) s += 4;
      return s;
    };
    return score(a) - score(b);
  });
}

async function fetchHtmlSafe(startUrl: string): Promise<string | null> {
  let current = assertSafePublicUrl(startUrl).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertSafePublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        headers: { 'User-Agent': 'SalesAutomationOS-EmailEnrichment/1.0', Accept: 'text/html,text/plain' },
        redirect: 'manual',
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) return null;
      const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ctype && !ctype.includes('text/html') && !ctype.includes('text/plain')) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      let received = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.length;
          if (received > MAX_BYTES) break;
          chunks.push(value);
        }
      }
      return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function candidatePaths(base: URL): string[] {
  const paths = ['/', '/contact', '/contatti', '/contacts', '/about', '/chi-siamo'];
  return paths.map((p) => new URL(p, base).toString());
}

export class HttpEmailEnrichmentProvider implements EmailEnrichmentProvider {
  async enrichFromWebsite(websiteUrl: string): Promise<EmailEnrichmentResult> {
    let base: URL;
    try {
      base = assertSafePublicUrl(websiteUrl);
    } catch {
      return {
        email: null,
        sourceUrl: null,
        sourceType: null,
        status: 'BLOCKED_URL',
        candidates: [],
        confidence: 0,
      };
    }

    const domain = normalizeDomain(base.toString());
    const candidates = new Set<string>();
    const mailtoSet = new Set<string>();
    let sourceUrl: string | null = null;
    let sourceType: 'mailto' | 'page_text' | null = null;

    for (const url of candidatePaths(base)) {
      const html = await fetchHtmlSafe(url);
      if (!html) continue;
      const extracted = extractEmails(html);
      for (const e of extracted.mailto) mailtoSet.add(e);
      for (const e of extracted.emails) candidates.add(e);
      if (extracted.emails.length > 0 && !sourceUrl) {
        sourceUrl = url;
        sourceType = extracted.mailto.length > 0 ? 'mailto' : 'page_text';
      }
      if (candidates.size > 0 && mailtoSet.size > 0) break;
    }

    const ranked = rankEmails([...candidates], domain, mailtoSet);
    // Prefer same-domain; never invent info@domain
    const best =
      ranked.find((e) => domain && e.endsWith(`@${domain}`)) ??
      ranked.find((e) => mailtoSet.has(e)) ??
      null;

    const confidence = best
      ? domain && best.endsWith(`@${domain}`)
        ? mailtoSet.has(best)
          ? 0.95
          : 0.8
        : 0.4
      : 0;

    return {
      email: best,
      sourceUrl,
      sourceType,
      status: best ? 'FOUND' : 'NOT_FOUND',
      candidates: ranked,
      confidence,
    };
  }
}

export const defaultEmailEnrichmentProvider = new HttpEmailEnrichmentProvider();
