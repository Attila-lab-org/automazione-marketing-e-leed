/**
 * Provider health runtime — stato reale da ENV + probe minimi.
 * Nessun secret viene restituito al client.
 */

import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export type RuntimeProviderHealth = 'ready' | 'mock' | 'error' | 'not_configured';

export type ProviderStatusItem = {
  id: 'supabase' | 'google_places' | 'resend' | 'browser_worker' | 'ai';
  name: string;
  status: RuntimeProviderHealth;
  detail: string;
};

export type ProvidersStatusResponse = {
  checkedAt: string;
  providers: ProviderStatusItem[];
};

function modeOf(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? 'mock').toLowerCase();
}

async function probeSupabase(env: NodeJS.ProcessEnv): Promise<ProviderStatusItem> {
  if (!isSupabaseConfigured(env) || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      id: 'supabase',
      name: 'Supabase',
      status: 'not_configured',
      detail: 'mancano URL / anon key / service role',
    };
  }

  try {
    const admin = createAdminSupabaseClient(env);
    const { error } = await admin.from('workspaces').select('id').limit(1);
    if (error) {
      return {
        id: 'supabase',
        name: 'Supabase',
        status: 'error',
        detail: `query fallita: ${error.message}`,
      };
    }
    return {
      id: 'supabase',
      name: 'Supabase',
      status: 'ready',
      detail: 'connessione e query minime OK',
    };
  } catch (err) {
    return {
      id: 'supabase',
      name: 'Supabase',
      status: 'error',
      detail: err instanceof Error ? err.message : 'errore sconosciuto',
    };
  }
}

async function probeGooglePlaces(env: NodeJS.ProcessEnv): Promise<ProviderStatusItem> {
  const mode = modeOf(env, 'GOOGLE_PLACES_PROVIDER_MODE');
  if (mode === 'mock') {
    return {
      id: 'google_places',
      name: 'Google Places',
      status: 'mock',
      detail: 'GOOGLE_PLACES_PROVIDER_MODE=mock',
    };
  }
  if (mode !== 'live') {
    return {
      id: 'google_places',
      name: 'Google Places',
      status: 'error',
      detail: `mode non valido: ${mode}`,
    };
  }
  if (!env.GOOGLE_PLACES_API_KEY) {
    return {
      id: 'google_places',
      name: 'Google Places',
      status: 'not_configured',
      detail: 'mode=live ma GOOGLE_PLACES_API_KEY assente',
    };
  }

  // Config operativa: mode=live + key. Il test reale di Text Search è su /api/leads/discover.
  // Un probe di rete a ogni caricamento Settings consumerebbe quota inutilmente.
  try {
    getGooglePlacesProvider(env);
    return {
      id: 'google_places',
      name: 'Google Places',
      status: 'ready',
      detail: 'mode=live · API key presente (probe rete via Trova lead)',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'errore sconosciuto';
    return {
      id: 'google_places',
      name: 'Google Places',
      status: 'error',
      detail: message.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]').slice(0, 180),
    };
  }
}

function staticMockProvider(
  id: ProviderStatusItem['id'],
  name: string,
  envKey: string,
  env: NodeJS.ProcessEnv,
): ProviderStatusItem {
  const mode = modeOf(env, envKey);
  if (mode === 'mock') {
    return { id, name, status: 'mock', detail: `${envKey}=mock` };
  }
  if (mode === 'live') {
    return {
      id,
      name,
      status: 'not_configured',
      detail: 'live non abilitato in questo slice',
    };
  }
  return { id, name, status: 'error', detail: `mode non valido: ${mode}` };
}

export async function getProvidersStatus(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProvidersStatusResponse> {
  const [supabase, googlePlaces] = await Promise.all([
    probeSupabase(env),
    probeGooglePlaces(env),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    providers: [
      supabase,
      googlePlaces,
      staticMockProvider('resend', 'Resend', 'RESEND_PROVIDER_MODE', env),
      staticMockProvider(
        'browser_worker',
        'Browser Worker',
        'BROWSER_WORKER_PROVIDER_MODE',
        env,
      ),
      staticMockProvider('ai', 'AI', 'AI_PROVIDER_MODE', env),
    ],
  };
}
