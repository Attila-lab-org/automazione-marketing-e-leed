/**
 * Auth admin: Supabase Auth + (ADMIN_EMAIL allowlist OR workspace OWNER/ADMIN).
 */

import { createClient } from '@supabase/supabase-js';
import {
  createAdminSessionToken,
  validateAdminCredentials,
  type AdminSessionPayload,
} from './admin-session';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export function parseAdminAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ADMIN_EMAIL ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmailAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allow = parseAdminAllowlist(env);
  if (allow.length === 0) return false;
  return allow.includes(email.trim().toLowerCase());
}

async function isWorkspaceAdmin(userId: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!isSupabaseConfigured(env) || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const admin = createAdminSupabaseClient(env);
    const { data } = await admin
      .from('workspace_members')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['OWNER', 'ADMIN'])
      .limit(1)
      .maybeSingle();
    return Boolean(data?.role);
  } catch {
    return false;
  }
}

export async function authenticateAdmin(
  email: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ email: string; token: string } | { error: string; status: number }> {
  const normalized = email.trim().toLowerCase();

  if (env.NODE_ENV === 'production' && !env.ADMIN_SESSION_SECRET && !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'ADMIN_SESSION_SECRET o SUPABASE_SERVICE_ROLE_KEY richiesti', status: 503 };
  }

  // 1) Supabase Auth
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (!error && data.user?.email && data.user.id) {
      const userEmail = data.user.email.toLowerCase();
      const allowlistConfigured = parseAdminAllowlist(env).length > 0;
      const allowlistOk = isAdminEmailAllowed(userEmail, env);
      const memberOk = await isWorkspaceAdmin(data.user.id, env);
      // Prefer allowlist when configured; otherwise workspace OWNER/ADMIN membership
      const authorized = allowlistConfigured ? allowlistOk : memberOk;
      if (!authorized) {
        return { error: 'Utente non autorizzato come admin', status: 403 };
      }
      try {
        const token = createAdminSessionToken(userEmail, env);
        return { email: userEmail, token };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Sessione non firmabile',
          status: 503,
        };
      }
    }
    if (!env.ADMIN_PASSWORD) {
      return {
        error:
          error?.message === 'Invalid login credentials'
            ? 'Credenziali non valide'
            : error?.message ?? 'Accesso negato',
        status: 401,
      };
    }
  }

  // 2) Fallback env ADMIN_*
  if (!env.ADMIN_PASSWORD) {
    return { error: 'Auth non configurata sul server', status: 503 };
  }
  if (parseAdminAllowlist(env).length > 0 && !isAdminEmailAllowed(normalized, env)) {
    return { error: 'Utente non autorizzato come admin', status: 403 };
  }
  if (!validateAdminCredentials(normalized, password, env)) {
    return { error: 'Credenziali non valide', status: 401 };
  }
  const token = createAdminSessionToken(normalized, env);
  return { email: normalized, token };
}

export type { AdminSessionPayload };
