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

/** Verifica Origin/Referer per mutation API (CSRF base). */
export async function assertSameOriginMutation(env: NodeJS.ProcessEnv = process.env) {
  const hdrs = await headers();
  const origin = hdrs.get('origin');
  const host = hdrs.get('host');
  const referer = hdrs.get('referer');
  const allowedHost = env.NEXT_PUBLIC_APP_URL
    ? new URL(env.NEXT_PUBLIC_APP_URL).host
    : host;

  if (!allowedHost) return;

  if (origin) {
    try {
      if (new URL(origin).host !== allowedHost) {
        throw new AuthError('Origin non consentita', 403);
      }
      return;
    } catch (err) {
      if (err instanceof AuthError) throw err;
    }
  }

  if (referer) {
    try {
      if (new URL(referer).host !== allowedHost) {
        throw new AuthError('Referer non consentito', 403);
      }
      return;
    } catch (err) {
      if (err instanceof AuthError) throw err;
    }
  }

  // Server-side fetch / curl without origin: allowed only in non-production dev.
  if (env.NODE_ENV === 'production') {
    throw new AuthError('Origin/Referer richiesti per mutation', 403);
  }
}

export async function guardAdminApi(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  const pathname = new URL(request.url).pathname;
  if (isPublicApi(pathname)) return null;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    await assertSameOriginMutation(env);
  }

  try {
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
