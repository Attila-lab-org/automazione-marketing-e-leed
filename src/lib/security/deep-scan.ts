/**
 * Seconda analisi autorizzata.
 *
 * Esegue solo GET non distruttive su un numero limitato di pagine pubbliche
 * collegate dal sito. Non invia moduli, non prova credenziali e non indovina
 * percorsi amministrativi.
 */

import { parse as parseHtml } from 'node-html-parser';
import type { SecurityDeepAuditRow } from '@/lib/types/database';
import { mapPool } from './concurrency';
import {
  fetchPublicPage,
  type FetchedPage,
  type FetchPublicPageOptions,
} from './fetch-page';
import {
  analyzeSurfacePage,
  computeSurfaceScore,
  type SurfaceFinding,
} from './surface-audit';

export const DEEP_MAX_PAGES = 12;
export const DEEP_MAX_DEPTH = 2;
export const DEEP_CONCURRENCY = 3;
export const DEEP_PAGE_BYTES = 750_000;
export const DEEP_TIMEOUT_MS = 8_000;

export type DeepFinding = SurfaceFinding & {
  pageUrls: string[];
  occurrences: number;
};

export type DeepPageResult = {
  url: string;
  status: number;
  title: string | null;
  findings: number;
  truncated: boolean;
};

export type DeepComparisonItem = {
  code: string;
  title: string;
};

export type DeepComparison = {
  confirmed: DeepComparisonItem[];
  newFindings: DeepComparisonItem[];
  notReproduced: DeepComparisonItem[];
};

export type DeepScanMetadata = {
  maxPages: number;
  maxDepth: number;
  requestsMade: number;
  securityTxt: 'present' | 'missing' | 'unreachable';
  robotsTxt: 'present' | 'missing' | 'unreachable';
  baselineScore?: number;
  baselineAuditId?: string;
  limits: string[];
};

export type DeepAnalysis = {
  score: number;
  pages: DeepPageResult[];
  findings: DeepFinding[];
  comparison: DeepComparison;
  metadata: DeepScanMetadata;
  finalUrl: string | null;
};

export function deepAnalysisFromRow(row: SecurityDeepAuditRow): DeepAnalysis | null {
  if (row.status !== 'completed' || row.score === null) return null;
  if (!Array.isArray(row.pages_scanned) || !Array.isArray(row.findings)) return null;
  if (!row.comparison || typeof row.comparison !== 'object' || Array.isArray(row.comparison)) {
    return null;
  }
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) return null;
  const rawFindings = (row.findings as unknown as DeepFinding[]).filter(
    (item) =>
      item &&
      typeof item.code === 'string' &&
      typeof item.title === 'string' &&
      Array.isArray(item.pageUrls),
  );
  const legacyBrokenUrls = new Set(
    rawFindings
      .filter(
        (item) =>
          item.code === 'HOMEPAGE_ERROR' &&
          row.final_url &&
          !item.pageUrls.includes(row.final_url),
      )
      .flatMap((item) => item.pageUrls),
  );
  const correctedLegacyPageError = legacyBrokenUrls.size > 0;
  const findings = rawFindings.flatMap((item) => {
    if (
      item.code === 'HOMEPAGE_ERROR' &&
      item.pageUrls.some((url) => legacyBrokenUrls.has(url))
    ) {
      return [
        {
          ...item,
          code: 'BROKEN_PUBLIC_PAGE',
          severity: 'LOW' as const,
          category: 'info' as const,
          title: 'Un link pubblico porta a una pagina non disponibile',
          detail:
            'Una pagina interna collegata ha risposto con errore. La homepage ha risposto correttamente.',
          limit:
            'È un collegamento da correggere, non una prova di intrusione e non abbassa il punteggio di sicurezza.',
        },
      ];
    }
    if (item.pageUrls.length && item.pageUrls.every((url) => legacyBrokenUrls.has(url))) {
      return [];
    }
    const validPageUrls = item.pageUrls.filter((url) => !legacyBrokenUrls.has(url));
    return [
      {
        ...item,
        pageUrls: validPageUrls,
        occurrences:
          typeof item.occurrences === 'number'
            ? Math.min(item.occurrences, validPageUrls.length)
            : validPageUrls.length,
      },
    ];
  });
  const comparisonRow = row.comparison as Record<string, unknown>;
  const parseComparisonItems = (value: unknown): DeepComparisonItem[] =>
    Array.isArray(value)
      ? value.flatMap((item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          typeof (item as Record<string, unknown>).code === 'string' &&
          typeof (item as Record<string, unknown>).title === 'string'
            ? [
                {
                  code: (item as Record<string, string>).code,
                  title: (item as Record<string, string>).title,
                },
              ]
            : [],
        )
      : [];
  const retainedCodes = new Set(findings.map((item) => item.code));
  const comparison: DeepComparison = {
    confirmed: parseComparisonItems(comparisonRow.confirmed).filter(
      (item) => retainedCodes.has(item.code) && item.code !== 'HOMEPAGE_ERROR',
    ),
    newFindings: parseComparisonItems(comparisonRow.newFindings).filter(
      (item) => retainedCodes.has(item.code) && item.code !== 'HOMEPAGE_ERROR',
    ),
    notReproduced: parseComparisonItems(comparisonRow.notReproduced),
  };
  return {
    score: correctedLegacyPageError ? computeSurfaceScore(findings) : row.score,
    pages: row.pages_scanned as unknown as DeepPageResult[],
    findings,
    comparison,
    metadata: row.metadata as unknown as DeepScanMetadata,
    finalUrl: row.final_url,
  };
}

type DeepFetcher = (
  url: string,
  options?: FetchPublicPageOptions,
) => Promise<FetchedPage>;

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function isSameAuthorizedSite(candidate: URL, authorized: URL): boolean {
  return canonicalHost(candidate.hostname) === canonicalHost(authorized.hostname);
}

function isSafeCrawlPath(pathname: string): boolean {
  if (
    /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|pptx?|rss|svg|tar|tiff?|txt|webmanifest|webp|woff2?|xlsx?|xml|zip)$/i.test(
      pathname,
    )
  ) {
    return false;
  }
  return !/(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|destroy)(?:\/|$)/i.test(
    pathname,
  );
}

export function extractSafeSameSiteLinks(
  html: string,
  pageUrl: string,
  authorizedUrl: string,
): string[] {
  const page = new URL(pageUrl);
  const authorized = new URL(authorizedUrl);
  const root = parseHtml(html);
  const links: string[] = [];

  for (const anchor of root.querySelectorAll('a[href]')) {
    const raw = (anchor.getAttribute('href') ?? '').trim();
    if (!raw || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    let candidate: URL;
    try {
      candidate = new URL(raw, page);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(candidate.protocol)) continue;
    if (!isSameAuthorizedSite(candidate, authorized)) continue;
    if (!isSafeCrawlPath(candidate.pathname)) continue;
    // Non riscriviamo URL dinamici: togliere la query può creare una pagina diversa o inesistente.
    if (candidate.search) continue;
    candidate.hash = '';
    links.push(candidate.href);
  }
  return [...new Set(links)];
}

function pageTitle(html: string): string | null {
  const title = parseHtml(html).querySelector('title')?.textContent.trim();
  return title ? title.slice(0, 120) : null;
}

function mergeFindings(
  pageFindings: Array<{ url: string; findings: SurfaceFinding[] }>,
): DeepFinding[] {
  const merged = new Map<string, DeepFinding>();
  for (const page of pageFindings) {
    for (const item of page.findings) {
      const current = merged.get(item.code);
      if (current) {
        current.occurrences += 1;
        if (!current.pageUrls.includes(page.url)) current.pageUrls.push(page.url);
        continue;
      }
      merged.set(item.code, {
        ...item,
        pageUrls: [page.url],
        occurrences: 1,
      });
    }
  }
  return [...merged.values()].sort((a, b) => {
    const categoryRank = { problem: 0, protection: 1, info: 2 } as const;
    const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    return (
      categoryRank[a.category] - categoryRank[b.category] ||
      severityRank[a.severity] - severityRank[b.severity]
    );
  });
}

export function compareDeepWithBaseline(
  baseline: SurfaceFinding[],
  deep: DeepFinding[],
  homepageUrl?: string,
): DeepComparison {
  const relevantBaseline = baseline.filter((item) => item.category !== 'info');
  const relevantDeep = deep.filter((item) => item.category !== 'info');
  const baselineCodes = new Set(relevantBaseline.map((item) => item.code));
  const deepHomepageCodes = new Set(
    relevantDeep
      .filter((item) => !homepageUrl || item.pageUrls.includes(homepageUrl))
      .map((item) => item.code),
  );
  const toItem = (item: SurfaceFinding): DeepComparisonItem => ({
    code: item.code,
    title: item.title,
  });

  return {
    confirmed: relevantDeep
      .filter(
        (item) =>
          baselineCodes.has(item.code) &&
          (!homepageUrl || item.pageUrls.includes(homepageUrl)),
      )
      .map(toItem),
    newFindings: relevantDeep
      .filter(
        (item) =>
          !baselineCodes.has(item.code) ||
          Boolean(homepageUrl && !item.pageUrls.includes(homepageUrl)),
      )
      .map(toItem),
    notReproduced: relevantBaseline
      .filter((item) => !deepHomepageCodes.has(item.code))
      .map(toItem),
  };
}

async function fetchMetadataFile(
  url: URL,
  fetcher: DeepFetcher,
  options: FetchPublicPageOptions,
): Promise<'present' | 'missing' | 'unreachable'> {
  try {
    const response = await fetcher(url.href, {
      ...options,
      maxHtmlBytes: 64_000,
    });
    return response.httpStatus >= 200 && response.httpStatus < 300 && response.html.trim()
      ? 'present'
      : 'missing';
  } catch {
    return 'unreachable';
  }
}

export async function runAuthorizedDeepScan(
  input: {
    targetUrl: string;
    baselineFindings: SurfaceFinding[];
  },
  fetcher: DeepFetcher = fetchPublicPage,
): Promise<DeepAnalysis> {
  const requested = new URL(input.targetUrl.includes('://') ? input.targetUrl : `https://${input.targetUrl}`);
  if (
    requested.port &&
    !(
      (requested.protocol === 'https:' && requested.port === '443') ||
      (requested.protocol === 'http:' && requested.port === '80')
    )
  ) {
    throw new Error('Il controllo approfondito usa solo le porte web standard 80 e 443.');
  }
  requested.pathname = '/';
  requested.search = '';
  requested.hash = '';

  let requestsMade = 0;
  const trackedFetch: DeepFetcher = (url, options) => {
    requestsMade += 1;
    return fetcher(url, options);
  };

  const homepage = await trackedFetch(requested.href, {
    timeoutMs: DEEP_TIMEOUT_MS,
    maxHtmlBytes: DEEP_PAGE_BYTES,
  });
  const authorized = new URL(homepage.finalUrl);
  if (!isSameAuthorizedSite(authorized, requested)) {
    throw new Error(
      'La homepage reindirizza verso un dominio diverso. Serve un consenso riferito a quel dominio prima di approfondire.',
    );
  }
  const allowedHostnames = new Set([
    requested.hostname.toLowerCase(),
    authorized.hostname.toLowerCase(),
    `www.${canonicalHost(authorized.hostname)}`,
    canonicalHost(authorized.hostname),
  ]);
  const fetchOptions: FetchPublicPageOptions = {
    timeoutMs: DEEP_TIMEOUT_MS,
    maxHtmlBytes: DEEP_PAGE_BYTES,
    maxRedirects: 4,
    allowedHostnames,
  };

  const fetched = new Map<string, FetchedPage>();
  fetched.set(homepage.finalUrl, homepage);
  const queue: Array<{ url: string; depth: number }> = extractSafeSameSiteLinks(
    homepage.html,
    homepage.finalUrl,
    authorized.href,
  ).map((url) => ({ url, depth: 1 }));
  const queued = new Set(queue.map((item) => item.url));

  while (queue.length && fetched.size < DEEP_MAX_PAGES) {
    const room = DEEP_MAX_PAGES - fetched.size;
    const batch = queue.splice(0, Math.min(room, DEEP_CONCURRENCY));
    const results = await mapPool(batch, DEEP_CONCURRENCY, async (candidate) => {
      try {
        const page = await trackedFetch(candidate.url, fetchOptions);
        return { candidate, page };
      } catch {
        return { candidate, page: null };
      }
    });

    for (const { candidate, page } of results) {
      if (!page || fetched.has(page.finalUrl)) continue;
      const contentType =
        Object.entries(page.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
      if (contentType && !/html|xhtml/i.test(contentType)) continue;
      fetched.set(page.finalUrl, page);
      if (candidate.depth >= DEEP_MAX_DEPTH) continue;
      for (const link of extractSafeSameSiteLinks(
        page.html,
        page.finalUrl,
        authorized.href,
      )) {
        if (queued.has(link) || fetched.has(link)) continue;
        queued.add(link);
        queue.push({ url: link, depth: candidate.depth + 1 });
      }
    }
  }

  const pageFindings = [...fetched.values()].map((page) => {
    const analysis = analyzeSurfacePage({
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      httpStatus: page.httpStatus,
      headers: page.headers,
      html: page.html,
      htmlTruncated: page.htmlTruncated,
      redirectChain: page.redirectChain,
    });
    if (
      page.finalUrl !== homepage.finalUrl &&
      (page.httpStatus >= 400 || !page.html.trim())
    ) {
      analysis.findings = [
        {
          code: 'BROKEN_PUBLIC_PAGE',
          severity: 'LOW',
          category: 'info',
          confidence: 'confirmed',
          title: 'Un link pubblico porta a una pagina non disponibile',
          detail: `La pagina collegata ha risposto HTTP ${page.httpStatus}. La homepage continua a essere valutata separatamente.`,
          evidence: `HTTP ${page.httpStatus}`,
          limit:
            'È un collegamento da correggere, non una prova di intrusione e non abbassa il punteggio di sicurezza.',
        },
      ];
      analysis.score = 100;
    }
    return { url: page.finalUrl, analysis };
  });

  const findings = mergeFindings(
    pageFindings.map(({ url, analysis }) => ({ url, findings: analysis.findings })),
  );
  const securityTxtUrl = new URL('/.well-known/security.txt', authorized);
  const robotsTxtUrl = new URL('/robots.txt', authorized);
  const [securityTxt, robotsTxt] = await Promise.all([
    fetchMetadataFile(securityTxtUrl, trackedFetch, fetchOptions),
    fetchMetadataFile(robotsTxtUrl, trackedFetch, fetchOptions),
  ]);

  if (securityTxt === 'present') {
    findings.push({
      code: 'SECURITY_TXT_PRESENT',
      severity: 'LOW',
      category: 'info',
      confidence: 'confirmed',
      title: 'Il sito pubblica un contatto per segnalazioni di sicurezza',
      detail: 'È presente /.well-known/security.txt.',
      evidence: securityTxtUrl.href,
      limit: 'La presenza del file non dimostra che ogni segnalazione venga gestita.',
      pageUrls: [securityTxtUrl.href],
      occurrences: 1,
    });
  }

  return {
    score: computeSurfaceScore(findings),
    pages: pageFindings.map(({ url, analysis }) => ({
      url,
      status: analysis.httpStatus,
      title: pageTitle(fetched.get(url)?.html ?? ''),
      findings: analysis.findings.length,
      truncated: analysis.htmlTruncated,
    })),
    findings,
    comparison: compareDeepWithBaseline(input.baselineFindings, findings, homepage.finalUrl),
    metadata: {
      maxPages: DEEP_MAX_PAGES,
      maxDepth: DEEP_MAX_DEPTH,
      requestsMade,
      securityTxt,
      robotsTxt,
      limits: [
        'Solo pagine pubbliche collegate, sullo stesso sito.',
        'Nessun modulo inviato e nessuna credenziale provata.',
        'Nessun test distruttivo, di carico o modifica dei dati.',
        `Massimo ${DEEP_MAX_PAGES} pagine HTML e profondità ${DEEP_MAX_DEPTH}.`,
      ],
    },
    finalUrl: homepage.finalUrl,
  };
}
