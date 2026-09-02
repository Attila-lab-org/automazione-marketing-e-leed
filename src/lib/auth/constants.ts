export const ADMIN_SESSION_COOKIE = 'sales-os-admin-session';

/** Route pubbliche (no auth). QA fixtures are NEVER public. */
export const PUBLIC_PATH_PREFIXES = ['/demo/', '/login', '/unsubscribe', '/privacy'] as const;

export const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/webhooks/', '/api/place-photo'] as const;

import { isQaFixturePath } from '@/lib/qa/gate';

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true;
  // Internal QA fixtures require auth (or 404 in production) — never public
  if (isQaFixturePath(pathname)) return false;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isPublicApi(pathname: string): boolean {
  if (pathname.startsWith('/demo/') && pathname.includes('/email-preview')) {
    if (isQaFixturePath(pathname.replace(/\/email-preview$/, ''))) return false;
    return true;
  }
  if (pathname.startsWith('/api/cron/')) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
}
