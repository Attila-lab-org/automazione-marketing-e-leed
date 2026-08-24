/**
 * Supabase client factory — typed against Database (migrations 0001..0016).
 */

import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import { createServerClient as createSsrServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AppSupabaseClient, Database } from '@/lib/types/supabase-database';

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
export function createBrowserSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): AppSupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  // @supabase/ssr generic slot order differs slightly from supabase-js; Database typing is preserved.
  return createSsrBrowserClient<Database>(url, anonKey) as unknown as AppSupabaseClient;
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
): AppSupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createSsrServerClient<Database>(url, anonKey, {
    cookies: {
      get: (name: string) => cookies.get(name),
      set: (name: string, value: string, options: CookieOptions) => cookies.set(name, value, options),
      remove: (name: string, options: CookieOptions) => cookies.remove(name, options),
    },
  }) as unknown as AppSupabaseClient;
}

/**
 * Admin client (service role — bypassa RLS). SOLO server-side.
 */
export function createAdminSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): AppSupabaseClient {
  const url = requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
