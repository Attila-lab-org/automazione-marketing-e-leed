/**
 * Blocca indirizzi interni prima di qualsiasi GET.
 * Una visita deve assomigliare a un browser su un sito pubblico, non a una scansione in rete privata.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UrlNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlNotAllowedError';
  }
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata.google.internal',
  'metadata.google.com',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

export function isPrivateIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  if (!value) return true;
  if (value === '::1' || value === '::' || value === '0.0.0.0') return true;

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : isIP(value) === 4 ? value : null;
  if (v4) {
    const parts = v4.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (isIP(value) === 6) {
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('fe80')) return true;
    if (value.startsWith('ff')) return true;
    return false;
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host.includes('metadata.google')) return true;
  return false;
}

/** Controlli sincroni: schema, host, IP letterale. Non risolve il DNS. */
export function parsePublicHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UrlNotAllowedError('Manca l’indirizzo del sito.');
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new UrlNotAllowedError('Indirizzo del sito non valido.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlNotAllowedError('Si apre solo un indirizzo http o https pubblico.');
  }
  if (url.username || url.password) {
    throw new UrlNotAllowedError('L’indirizzo non può contenere nome utente o password.');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UrlNotAllowedError('Questo indirizzo non è un sito pubblico.');
  }
  if (isIP(url.hostname) && isPrivateIp(url.hostname)) {
    throw new UrlNotAllowedError('Questo indirizzo non è un sito pubblico.');
  }
  return url;
}

/** Stesso controllo, più risoluzione DNS: rifiuta host che puntano a reti private. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = parsePublicHttpUrl(raw);
  if (isIP(url.hostname)) return url;

  let records: Array<{ address: string }>;
  try {
    records = await lookup(url.hostname, { all: true });
  } catch {
    throw new UrlNotAllowedError(`Non riesco a trovare il sito ${url.hostname}.`);
  }
  if (!records.length) {
    throw new UrlNotAllowedError(`Non riesco a trovare il sito ${url.hostname}.`);
  }
  if (records.some((row) => isPrivateIp(row.address))) {
    throw new UrlNotAllowedError('Questo indirizzo non è un sito pubblico.');
  }
  return url;
}
