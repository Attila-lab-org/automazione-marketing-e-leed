export const ADMIN_SESSION_COOKIE = 'sales-os-admin-session';

/** Route pubbliche (no auth). */
export const PUBLIC_PATH_PREFIXES = ['/demo/', '/login'] as const;

export const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/webhooks/'] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isPublicApi(pathname: string): boolean {
  if (pathname.startsWith('/demo/') && pathname.includes('/email-preview')) return true;
  if (pathname.startsWith('/api/cron/')) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
}
