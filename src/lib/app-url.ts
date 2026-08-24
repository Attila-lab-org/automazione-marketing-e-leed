/**
 * NEXT_PUBLIC_APP_URL readiness — fail-closed for live TEST sends.
 */

export type AppUrlStatus = 'READY' | 'MISSING' | 'INVALID';

export function getAppUrlStatus(env: NodeJS.ProcessEnv = process.env): {
  status: AppUrlStatus;
  detail: string;
  url: string | null;
} {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  if (!raw) {
    return { status: 'MISSING', detail: 'NEXT_PUBLIC_APP_URL mancante', url: null };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { status: 'INVALID', detail: 'URL non valido', url: null };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { status: 'INVALID', detail: 'schema non http(s)', url: null };
  }
  const host = parsed.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const vercelEnv = (env.VERCEL_ENV ?? '').toLowerCase();
  const isProdRuntime = nodeEnv === 'production' || vercelEnv === 'production';
  if (isProdRuntime && isLocal) {
    return {
      status: 'INVALID',
      detail: 'localhost non ammesso in production',
      url: null,
    };
  }
  return { status: 'READY', detail: 'APP URL production-safe', url: parsed.origin };
}

/** Throws if live send requires a production-safe APP URL. */
export function assertAppUrlSafeForLiveSend(env: NodeJS.ProcessEnv = process.env): string {
  const st = getAppUrlStatus(env);
  if (st.status !== 'READY' || !st.url) {
    throw new Error(`APP_URL_NOT_READY: ${st.detail}`);
  }
  return st.url;
}

export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const st = getAppUrlStatus(env);
  if (st.url) return st.url;
  if ((env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error(`APP_URL_NOT_READY: ${st.detail}`);
  }
  return 'http://localhost:3000';
}
