/**
 * Provider health runtime — stato reale da ENV + probe minimi.
 * Nessun secret viene restituito al client.
 */

import { getAppUrlStatus } from '@/lib/app-url';
import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import { getOwnerCommercialStatus } from '@/lib/templates/owner-commercial';
import { getTestDeliveryStatus } from '@/lib/campaigns/test-delivery';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export type RuntimeProviderHealth = 'ready' | 'mock' | 'error' | 'not_configured';

export type ProviderStatusItem = {
  id: 'supabase' | 'google_places' | 'resend' | 'browser_worker' | 'ai';
  name: string;
  status: RuntimeProviderHealth;
  detail: string;
};

export type CommercialConfigItem = {
  id:
    | 'owner_whatsapp'
    | 'owner_contact_url'
    | 'owner_offer_price'
    | 'owner_show_bridge'
    | 'resend_test_allowlist'
    | 'test_campaign_safety'
    | 'app_url';
  name: string;
  /** READY / MISSING / INVALID — never include secret values. */
  status: 'READY' | 'MISSING' | 'INVALID';
  detail: string;
};

export type ProvidersStatusResponse = {
  checkedAt: string;
  providers: ProviderStatusItem[];
  commercial: CommercialConfigItem[];
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

function commercialConfig(env: NodeJS.ProcessEnv): CommercialConfigItem[] {
  const st = getOwnerCommercialStatus(env);
  const test = getTestDeliveryStatus(env);
  const appUrl = getAppUrlStatus(env);
  return [
    {
      id: 'owner_whatsapp',
      name: 'OWNER_WHATSAPP',
      status: st.whatsapp,
      detail: st.whatsapp === 'READY' ? 'configurato' : 'mancante — nessun CTA WhatsApp',
    },
    {
      id: 'owner_contact_url',
      name: 'OWNER_CONTACT_URL',
      status: st.contactUrl,
      detail:
        st.contactUrl === 'READY' ? 'configurato' : 'mancante — nessun redirect site commerciale',
    },
    {
      id: 'owner_offer_price',
      name: 'OWNER_OFFER_PRICE',
      status: st.offerPrice,
      detail:
        st.offerPrice === 'READY'
          ? 'prezzo mostrato in template / WhatsApp'
          : 'vuoto — nessun prezzo in demo',
    },
    {
      id: 'owner_show_bridge',
      name: 'OWNER_SHOW_BRIDGE',
      status: st.showBridge ? 'READY' : 'MISSING',
      detail: st.showBridge ? 'mid-page OwnerBridge ON' : 'default OFF (85% restaurant)',
    },
    {
      id: 'app_url',
      name: 'APP URL (NEXT_PUBLIC_APP_URL)',
      status: appUrl.status,
      detail: appUrl.detail,
    },
    {
      id: 'resend_test_allowlist',
      name: 'RESEND_TEST_RECIPIENT_ALLOWLIST',
      status: test.allowlist,
      detail:
        test.allowlist === 'READY'
          ? `${test.allowlistCount} indirizzo/i allowlisted (valori non mostrati)`
          : 'mancante — campagne TEST bloccate server-side',
    },
    {
      id: 'test_campaign_safety',
      name: 'Test Campaign Safety',
      status: test.safety,
      detail:
        test.safety === 'READY'
          ? 'allowlist attiva · BLOCKED_TEST_RECIPIENT enforced'
          : 'configura RESEND_TEST_RECIPIENT_ALLOWLIST',
    },
  ];
}

function probeResend(env: NodeJS.ProcessEnv): ProviderStatusItem {
  const mode = modeOf(env, 'RESEND_PROVIDER_MODE');
  if (mode === 'mock') {
    return {
      id: 'resend',
      name: 'Resend',
      status: 'mock',
      detail: 'RESEND MOCK · RESEND_PROVIDER_MODE=mock',
    };
  }
  if (mode === 'live') {
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM?.trim()) {
      return {
        id: 'resend',
        name: 'Resend',
        status: 'not_configured',
        detail: 'live senza RESEND_API_KEY / RESEND_FROM',
      };
    }
    return {
      id: 'resend',
      name: 'Resend',
      status: 'ready',
      detail: 'RESEND LIVE · TEST ONLY (PRODUCTION hard-blocked)',
    };
  }
  return { id: 'resend', name: 'Resend', status: 'error', detail: `mode non valido: ${mode}` };
}

/** Single source of truth for header / operator badge. */
export function getResendRuntimeBadge(env: NodeJS.ProcessEnv = process.env): {
  label: 'RESEND MOCK' | 'RESEND LIVE · TEST ONLY' | 'RESEND ERROR';
  mode: 'mock' | 'live' | 'error';
  detail: string;
} {
  const mode = modeOf(env, 'RESEND_PROVIDER_MODE');
  if (mode === 'mock') {
    return {
      label: 'RESEND MOCK',
      mode: 'mock',
      detail: 'Nessuna email reale. Provider mock.',
    };
  }
  if (mode === 'live') {
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM?.trim()) {
      return {
        label: 'RESEND ERROR',
        mode: 'error',
        detail: 'mode=live ma key/from mancanti',
      };
    }
    return {
      label: 'RESEND LIVE · TEST ONLY',
      mode: 'live',
      detail: 'Live solo per campagne TEST allowlisted. PRODUCTION bloccata.',
    };
  }
  return { label: 'RESEND ERROR', mode: 'error', detail: `mode non valido: ${mode}` };
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
      probeResend(env),
      staticMockProvider(
        'browser_worker',
        'Browser Worker',
        'BROWSER_WORKER_PROVIDER_MODE',
        env,
      ),
      staticMockProvider('ai', 'AI', 'AI_PROVIDER_MODE', env),
    ],
    commercial: commercialConfig(env),
  };
}
