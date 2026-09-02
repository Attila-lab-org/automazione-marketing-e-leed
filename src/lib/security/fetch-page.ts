import { randomBytes } from 'node:crypto';
import { assertPublicHttpUrl, UrlNotAllowedError } from './url-guard';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_HTML_BYTES = 1_500_000;
export const MAX_REDIRECTS = 5;

export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: Record<string, string>;
  html: string;
  htmlTruncated: boolean;
  redirectChain: string[];
};

export type FetchPublicPageOptions = {
  maxHtmlBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Se presente, blocca redirect verso host diversi dal sito autorizzato. */
  allowedHostnames?: Set<string>;
};

export class PageFetchError extends Error {
  readonly code: 'TIMEOUT' | 'CERT' | 'NETWORK' | 'BLOCKED' | 'EMPTY';
  constructor(code: PageFetchError['code'], message: string) {
    super(message);
    this.name = 'PageFetchError';
    this.code = code;
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) out['set-cookie'] = cookies.join('\n');
  }
  return out;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function classifyFetchError(err: unknown): PageFetchError {
  if (err instanceof PageFetchError) return err;
  if (err instanceof UrlNotAllowedError) {
    return new PageFetchError('BLOCKED', err.message);
  }
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || /timeout|aborted/i.test(message)) {
    return new PageFetchError('TIMEOUT', 'La pagina non ha risposto entro 15 secondi.');
  }
  if (/certificate|cert_|unable to verify|err_tls|ssl/i.test(message)) {
    return new PageFetchError(
      'CERT',
      'Il browser non accetta il lucchetto di questa pagina (certificato non valido).',
    );
  }
  return new PageFetchError('NETWORK', 'Non sono riuscito ad aprire la pagina pubblica.');
}

async function consumeQuietly(res: Response) {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}

async function readBodyLimited(
  res: Response,
  maxBytes: number,
): Promise<{ buffer: Buffer; truncated: boolean }> {
  if (!res.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const chunk = Buffer.from(value);
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    } else {
      reader.releaseLock();
    }
  }
  return { buffer: Buffer.concat(chunks, total), truncated };
}

/**
 * Una sola GET della homepage pubblica, come un visitatore.
 * Segue i reindirizzamenti solo se restano su http(s) pubblici.
 */
export async function fetchPublicPage(
  rawUrl: string,
  options: FetchPublicPageOptions = {},
): Promise<FetchedPage> {
  let current = await assertPublicHttpUrl(rawUrl);
  const requestedUrl = current.href;
  let lastHeaders: Record<string, string> = {};
  const redirectChain: string[] = [current.href];

  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxHtmlBytes = options.maxHtmlBytes ?? MAX_HTML_BYTES;

  if (options.allowedHostnames && !options.allowedHostnames.has(current.hostname.toLowerCase())) {
    throw new PageFetchError('BLOCKED', 'La pagina è fuori dal sito autorizzato.');
  }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let res: Response;
    try {
      res = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        },
      });
    } catch (err) {
      throw classifyFetchError(err);
    }

    lastHeaders = headersToRecord(res.headers);

    if (isRedirect(res.status)) {
      await consumeQuietly(res);
      const location = res.headers.get('location');
      if (!location) {
        throw new PageFetchError('EMPTY', 'Il sito ha chiesto un reindirizzamento senza destinazione.');
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new PageFetchError('BLOCKED', 'Il reindirizzamento non è un indirizzo valido.');
      }
      current = await assertPublicHttpUrl(next.href);
      if (
        options.allowedHostnames &&
        !options.allowedHostnames.has(current.hostname.toLowerCase())
      ) {
        throw new PageFetchError(
          'BLOCKED',
          'Il reindirizzamento porta fuori dal sito autorizzato.',
        );
      }
      redirectChain.push(current.href);
      continue;
    }

    const { buffer, truncated: htmlTruncated } = await readBodyLimited(res, maxHtmlBytes);
    const html = buffer.toString('utf8');
    return {
      requestedUrl,
      finalUrl: res.url || current.href,
      httpStatus: res.status,
      // Le protezioni vanno giudicate sulla pagina finale, non su una risposta 301 intermedia.
      headers: lastHeaders,
      html,
      htmlTruncated,
      redirectChain,
    };
  }

  throw new PageFetchError(
    'EMPTY',
    `Troppi reindirizzamenti (oltre ${maxRedirects}). Non ho raggiunto una pagina finale.`,
  );
}

export async function fetchPublicHomepage(rawUrl: string): Promise<FetchedPage> {
  const homepage = await assertPublicHttpUrl(rawUrl);
  homepage.pathname = '/';
  homepage.search = '';
  homepage.hash = '';
  return fetchPublicPage(homepage.href);
}

export function newPublicSlug(): string {
  return randomBytes(6).toString('hex');
}
