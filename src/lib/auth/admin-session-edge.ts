/**
 * Verifica sessione admin compatibile Edge (middleware Vercel).
 * Usa Web Crypto — nessun import node:crypto.
 */
import type { AdminSessionPayload } from './session-types';

type Env = Record<string, string | undefined>;

function sessionSecret(env: Env): string | null {
  return env.ADMIN_SESSION_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256Base64Url(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyAdminSessionTokenEdge(
  token: string | undefined | null,
  env: Env = process.env as Env,
): Promise<AdminSessionPayload | null> {
  if (!token) return null;
  const secret = sessionSecret(env);
  if (!secret) return null;

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expected = await hmacSha256Base64Url(payloadB64, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const json = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(json) as AdminSessionPayload;
    if (!payload.sub || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
