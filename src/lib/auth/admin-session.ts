import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ADMIN_SESSION_COOKIE } from './constants';
import type { AdminSessionPayload } from './session-types';
import { SESSION_TTL_MS } from './session-types';

export type { AdminSessionPayload } from './session-types';

function secret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.ADMIN_SESSION_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error('ADMIN_SESSION_SECRET mancante: impossibile firmare la sessione admin');
  }
  return value;
}

function sign(payloadB64: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', secret(env)).update(payloadB64).digest('base64url');
}

export function createAdminSessionToken(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const payload: AdminSessionPayload = {
    sub: email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, env)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): AdminSessionPayload | null {
  if (!token) return null;
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;
  const expected = sign(payloadB64, env);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (!payload.sub || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function adminSessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    name: ADMIN_SESSION_COOKIE,
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function validateAdminCredentials(
  email: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expectedEmail = (env.ADMIN_EMAIL ?? 'admin@localhost').trim().toLowerCase();
  const expectedPassword = env.ADMIN_PASSWORD;
  if (!expectedPassword) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized !== expectedEmail) return false;
  if (password.length !== expectedPassword.length) return false;
  return timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword));
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString('hex');
}
