import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

export type EmailSourceType = 'mailto' | 'page_text';

/** Provenance for a single email candidate (never invent emails). */
export interface EmailCandidateEvidence {
  email: string;
  sourceUrl: string | null;
  sourceType: EmailSourceType | null;
  sameDomain: boolean;
  confidence: number;
}

export interface EmailEnrichmentResult {
  email: string | null;
  /** Provenance of the SELECTED primary email (not the first page with any email). */
  sourceUrl: string | null;
  sourceType: EmailSourceType | null;
  sameDomain: boolean;
  status: 'FOUND' | 'NOT_FOUND' | 'NO_WEBSITE' | 'ERROR' | 'BLOCKED_URL' | 'ALREADY_PRESENT';
  candidates: string[];
  candidateEvidence: EmailCandidateEvidence[];
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

export function isPrivateIp(hostnameOrIp: string): boolean {
  const host = hostnameOrIp.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (isIPv4(host)) {
    const parts = host.split('.').map(Number);
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (isIPv6(host)) {
    if (host === '::1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('fe80')) return true;
    const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1] && isPrivateIp(mapped[1])) return true;
    return false;
  }
  return false;
}

/** Sync SSRF gate on URL shape (no DNS). */
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

/** Resolve DNS and reject private/link-local/metadata destinations. */
export async function assertSafePublicUrlResolved(raw: string): Promise<URL> {
  const url = assertSafePublicUrl(raw);
  let addresses: string[];
  try {
    const result = await lookup(url.hostname, { all: true, verbatim: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new Error('BLOCKED_URL: DNS resolution failed');
  }
  if (addresses.length === 0) throw new Error('BLOCKED_URL: DNS empty');
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`BLOCKED_URL: DNS risolto a IP privato (${addr})`);
    }
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

function confidenceFor(
  email: string,
  domain: string | null,
  mailto: Set<string>,
): number {
  if (domain && email.endsWith(`@${domain}`)) {
    return mailto.has(email) ? 0.95 : 0.8;
  }
  if (mailto.has(email)) return 0.55;
  return 0.4;
}

async function fetchHtmlSafe(startUrl: string): Promise<string | null> {
  let current = (await assertSafePublicUrlResolved(startUrl)).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafePublicUrlResolved(current);
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

function emptyResult(
  status: EmailEnrichmentResult['status'],
): EmailEnrichmentResult {
  return {
    email: null,
    sourceUrl: null,
    sourceType: null,
    sameDomain: false,
    status,
    candidates: [],
    candidateEvidence: [],
    confidence: 0,
  };
}

export class HttpEmailEnrichmentProvider implements EmailEnrichmentProvider {
  async enrichFromWebsite(websiteUrl: string): Promise<EmailEnrichmentResult> {
    let base: URL;
    try {
      base = await assertSafePublicUrlResolved(websiteUrl);
    } catch {
      return emptyResult('BLOCKED_URL');
    }

    const domain = normalizeDomain(base.toString());
    const candidates = new Set<string>();
    const mailtoSet = new Set<string>();
    /** First-seen provenance per email (selected email uses its own, not first page). */
    const evidenceByEmail = new Map<
      string,
      { sourceUrl: string; sourceType: EmailSourceType }
    >();

    for (const url of candidatePaths(base)) {
      const html = await fetchHtmlSafe(url);
      if (!html) continue;
      const extracted = extractEmails(html);
      for (const e of extracted.mailto) mailtoSet.add(e);
      for (const e of extracted.emails) {
        candidates.add(e);
        if (!evidenceByEmail.has(e)) {
          evidenceByEmail.set(e, {
            sourceUrl: url,
            sourceType: extracted.mailto.includes(e) ? 'mailto' : 'page_text',
          });
        }
      }
      if (candidates.size > 0 && mailtoSet.size > 0) break;
    }

    const ranked = rankEmails([...candidates], domain, mailtoSet);
    const best =
      ranked.find((e) => domain && e.endsWith(`@${domain}`)) ??
      ranked.find((e) => mailtoSet.has(e)) ??
      null;

    const candidateEvidence: EmailCandidateEvidence[] = ranked.map((email) => {
      const ev = evidenceByEmail.get(email);
      const sameDomain = Boolean(domain && email.endsWith(`@${domain}`));
      return {
        email,
        sourceUrl: ev?.sourceUrl ?? null,
        sourceType: ev?.sourceType ?? null,
        sameDomain,
        confidence: confidenceFor(email, domain, mailtoSet),
      };
    });

    if (!best) {
      return {
        ...emptyResult('NOT_FOUND'),
        candidates: ranked,
        candidateEvidence,
      };
    }

    const selected = evidenceByEmail.get(best);
    const sameDomain = Boolean(domain && best.endsWith(`@${domain}`));
    const confidence = confidenceFor(best, domain, mailtoSet);

    return {
      email: best,
      sourceUrl: selected?.sourceUrl ?? null,
      sourceType: selected?.sourceType ?? null,
      sameDomain,
      status: 'FOUND',
      candidates: ranked,
      candidateEvidence,
      confidence,
    };
  }
}

export const defaultEmailEnrichmentProvider = new HttpEmailEnrichmentProvider();

/** Discreet Review Queue label from selected-email evidence. */
export function formatEmailEvidenceLabel(ev: {
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: number | null;
}): string | null {
  const path = (() => {
    if (!ev.sourceUrl) return null;
    try {
      const u = new URL(ev.sourceUrl);
      return u.pathname === '/' ? '/' : u.pathname;
    } catch {
      return null;
    }
  })();
  const type =
    ev.sourceType === 'mailto' ? 'mailto' : ev.sourceType === 'page_text' ? 'testo pagina' : null;
  const conf =
    typeof ev.confidence === 'number'
      ? ev.confidence >= 0.8
        ? 'confidence alta'
        : ev.confidence >= 0.55
          ? 'confidence media'
          : 'confidence bassa'
      : null;
  const parts = [
    path ? `trovata su ${path}` : null,
    type,
    conf,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
