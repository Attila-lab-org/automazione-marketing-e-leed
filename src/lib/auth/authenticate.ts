/**
 * Auth admin: preferisce Supabase Auth (già configurato su Production).
 * Fallback opzionale su ADMIN_EMAIL/ADMIN_PASSWORD se presenti.
 * La sessione cookie HMAC resta Edge-compatible per il middleware.
 */

import { createClient } from '@supabase/supabase-js';
import {
  createAdminSessionToken,
  validateAdminCredentials,
  type AdminSessionPayload,
} from './admin-session';

export async function authenticateAdmin(
  email: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ email: string; token: string } | { error: string; status: number }> {
  const normalized = email.trim().toLowerCase();

  // 1) Supabase Auth (chiavi già presenti su Production da ieri)
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (!error && data.user?.email) {
      // Firma sessione app con secret già disponibile in Production
      // (ADMIN_SESSION_SECRET oppure SUPABASE_SERVICE_ROLE_KEY)
      try {
        const token = createAdminSessionToken(data.user.email.toLowerCase(), env);
        return { email: data.user.email.toLowerCase(), token };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Sessione non firmabile',
          status: 503,
        };
      }
    }
    // Se Supabase rifiuta e non c'è fallback env, restituisci errore chiaro
    if (!env.ADMIN_PASSWORD) {
      return {
        error: error?.message === 'Invalid login credentials'
          ? 'Credenziali non valide'
          : error?.message ?? 'Accesso negato',
        status: 401,
      };
    }
  }

  // 2) Fallback env ADMIN_* (dev / gusta-go)
  if (!env.ADMIN_PASSWORD) {
    return { error: 'Auth non configurata sul server', status: 503 };
  }
  if (!validateAdminCredentials(normalized, password, env)) {
    return { error: 'Credenziali non valide', status: 401 };
  }
  const token = createAdminSessionToken(normalized, env);
  return { email: normalized, token };
}

export type { AdminSessionPayload };
