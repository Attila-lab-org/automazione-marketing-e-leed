/**
 * Supabase client factory — Phase 1.
 *
 * - Browser client: anon key, sicuro lato client (RLS applicata §16.4).
 * - Server client: cookie-based per le route Next.js (sessione utente).
 * - Admin client: service role, SOLO server-side — mai esposto al client (§18).
 *
 * Ogni factory fallisce con messaggio chiaro se mancano le env (mock-friendly:
 * i test unitari non toccano mai queste factory).
 */

import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import { createServerClient as createSsrServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `Supabase: variabile d'ambiente "${name}" mancante. ` +
        'Configura .env.local (vedi README) oppure usa i provider in mock mode per lo sviluppo senza backend.',
    );
  }
  return value;
}

/** true se le env pubbliche minime sono presenti (utile per health check UI). */
export function isSupabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Client browser (anon key + RLS). */
export function createBrowserSupabaseClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createSsrBrowserClient(url, anonKey);
}

export interface CookieAdapter {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  remove(name: string, options: CookieOptions): void;
}

/**
 * Client server (sessione utente via cookie). Da usare in Route Handler /
 * Server Component con l'adapter cookie di Next.js.
 */
export function createServerSupabaseClient(
  cookies: CookieAdapter,
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createSsrServerClient(url, anonKey, {
    cookies: {
      get: (name: string) => cookies.get(name),
      set: (name: string, value: string, options: CookieOptions) => cookies.set(name, value, options),
      remove: (name: string, options: CookieOptions) => cookies.remove(name, options),
    },
  });
}

/**
 * Admin client (service role — bypassa RLS). SOLO server-side: domain services,
 * worker, job orchestrator. La service key non arriva mai al client (§11.2, §18).
 */
export function createAdminSupabaseClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
