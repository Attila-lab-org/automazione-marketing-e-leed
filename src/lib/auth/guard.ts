import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  isPublicApi,
  isPublicPath,
} from './constants';
import { verifyAdminSessionToken } from './admin-session';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getAdminSession(env: NodeJS.ProcessEnv = process.env) {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(token, env);
}

export async function requireAdminSession(env: NodeJS.ProcessEnv = process.env) {
  const session = await getAdminSession(env);
  if (!session) throw new AuthError('Sessione admin non valida o scaduta', 401);
  return session;
}

/** Host ammessi per CSRF: Host della richiesta + APP_URL + VERCEL_URL. */
export function collectAllowedMutationHosts(
  env: NodeJS.ProcessEnv,
  requestHost: string | null,
): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const v = raw?.trim();
    if (!v) return;
    try {
      if (v.includes('://')) {
        hosts.add(new URL(v).host.toLowerCase());
      } else {
        hosts.add(v.replace(/\/$/, '').toLowerCase());
      }
    } catch {
      // ignore malformed
    }
  };

  add(requestHost);
  add(env.NEXT_PUBLIC_APP_URL);
  add(env.VERCEL_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    add(env.VERCEL_PROJECT_PRODUCTION_URL);
  }
  return hosts;
}

function hostAllowed(candidate: string, allowed: Set<string>): boolean {
  const h = candidate.toLowerCase();
  if (allowed.has(h)) return true;
  // Confronta anche solo hostname (senza porta) per localhost:3000 vs localhost
  try {
    const onlyHost = h.split(':')[0] ?? h;
    for (const a of allowed) {
      if (a === h || a.split(':')[0] === onlyHost) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Verifica Origin/Referer per mutation API (CSRF base). */
export async function assertSameOriginMutation(env: NodeJS.ProcessEnv = process.env) {
  const hdrs = await headers();
  const origin = hdrs.get('origin');
  const host = hdrs.get('host');
  const referer = hdrs.get('referer');
  const allowed = collectAllowedMutationHosts(env, host);

  if (allowed.size === 0) return;

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (!hostAllowed(originHost, allowed)) {
        throw new AuthError('Origin non consentita', 403);
      }
      return;
    } catch (err) {
      if (err instanceof AuthError) throw err;
    }
  }

  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (!hostAllowed(refererHost, allowed)) {
        throw new AuthError('Referer non consentito', 403);
      }
      return;
    } catch (err) {
      if (err instanceof AuthError) throw err;
    }
  }

  // Server-side fetch / curl without origin: allowed only in non-production.
  if (env.NODE_ENV === 'production' || (env.VERCEL_ENV ?? '').toLowerCase() === 'production') {
    throw new AuthError('Origin/Referer richiesti per mutation', 403);
  }
}

export async function guardAdminApi(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  const pathname = new URL(request.url).pathname;
  if (isPublicApi(pathname)) return null;

  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      await assertSameOriginMutation(env);
    }
    await requireAdminSession(env);
    return null;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export function redirectToLogin(pathname: string) {
  const url = new URL('/login', 'http://local');
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, 'http://local'));
}

export { isPublicPath, isPublicApi };
