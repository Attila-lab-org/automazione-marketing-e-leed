export interface EmailEnrichmentResult {
  email: string | null;
  sourceUrl: string | null;
  status: 'FOUND' | 'NOT_FOUND' | 'NO_WEBSITE' | 'ERROR';
  candidates: string[];
}

export interface EmailEnrichmentProvider {
  enrichFromWebsite(websiteUrl: string): Promise<EmailEnrichmentResult>;
}

const EMAIL_REGEX =
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 512_000;

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

function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) {
    found.add(normalizeEmail(match[1]!));
  }
  for (const match of html.matchAll(EMAIL_REGEX)) {
    found.add(normalizeEmail(match[0]!));
  }
  return [...found];
}

function rankEmails(emails: string[], domain: string | null): string[] {
  return [...emails].sort((a, b) => {
    const score = (e: string) => {
      if (domain && e.endsWith(`@${domain}`)) return 0;
      if (e.includes('info@') || e.includes('contact@') || e.includes('contatti@')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SalesAutomationOS-EmailEnrichment/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
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

function candidatePaths(base: URL): string[] {
  const paths = ['/', '/contact', '/contatti', '/contacts', '/about', '/chi-siamo'];
  return paths.map((p) => new URL(p, base).toString());
}

/** Enrichment email leggero server-side — nessun browser, nessuna AI. */
export class HttpEmailEnrichmentProvider implements EmailEnrichmentProvider {
  async enrichFromWebsite(websiteUrl: string): Promise<EmailEnrichmentResult> {
    const domain = normalizeDomain(websiteUrl);
    if (!domain) {
      return { email: null, sourceUrl: null, status: 'NO_WEBSITE', candidates: [] };
    }

    const base = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    const candidates = new Set<string>();
    let sourceUrl: string | null = null;

    for (const url of candidatePaths(base)) {
      const html = await fetchHtml(url);
      if (!html) continue;
      for (const email of extractEmails(html)) {
        candidates.add(email);
        if (!sourceUrl) sourceUrl = url;
      }
      if (candidates.size > 0) break;
    }

    const ranked = rankEmails([...candidates], domain);
    const best = ranked[0] ?? null;
    return {
      email: best,
      sourceUrl,
      status: best ? 'FOUND' : 'NOT_FOUND',
      candidates: ranked,
    };
  }
}

export const defaultEmailEnrichmentProvider = new HttpEmailEnrichmentProvider();
