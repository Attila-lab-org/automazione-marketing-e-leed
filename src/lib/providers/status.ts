/**
 * Provider health runtime — stato reale da ENV + probe minimi.
 * Nessun secret viene restituito al client.
 */

import { getAppUrlStatus } from '@/lib/app-url';
import { getPublicAiReadiness } from '@/lib/ai/readiness';
import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import { getTelegramCredentialStatus } from '@/lib/providers/telegram/webhook';
import { getEmailReplyPathReadiness } from '@/lib/inbound/email-readiness';
import { getOwnerCommercialStatus } from '@/lib/templates/owner-commercial';
import { getTestDeliveryStatus } from '@/lib/campaigns/test-delivery';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export type RuntimeProviderHealth = 'ready' | 'mock' | 'error' | 'not_configured';

export type ProviderStatusItem = {
  id: 'supabase' | 'google_places' | 'resend' | 'telegram' | 'browser_worker' | 'ai';
  name: string;
  status: RuntimeProviderHealth;
  detail: string;
};

export type CommercialConfigItem = {
  id:
    | 'owner_whatsapp'
    | 'owner_phone'
    | 'owner_contact_url'
    | 'owner_offer_price'
    | 'owner_show_bridge'
    | 'resend_test_allowlist'
    | 'test_campaign_safety'
    | 'resend_reply_path'
    | 'resend_webhook'
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

function probeAi(env: NodeJS.ProcessEnv): ProviderStatusItem {
  const readiness = getPublicAiReadiness(env);
  if (!readiness.modeValid) {
    return {
      id: 'ai',
      name: 'AI',
      status: 'error',
      detail: readiness.detail,
    };
  }
  if (readiness.mode === 'mock') {
    return {
      id: 'ai',
      name: 'AI',
      status: 'mock',
      detail: 'AI_PROVIDER_MODE=mock · nessuna chiamata OpenAI',
    };
  }
  if (!readiness.apiKeyConfigured) {
    return {
      id: 'ai',
      name: 'AI',
      status: 'not_configured',
      detail: 'mode=openai ma OPENAI_API_KEY assente',
    };
  }
  return {
    id: 'ai',
    name: 'AI',
    status: 'ready',
    detail: `OpenAI pronto · Luna ${readiness.models.luna}`,
  };
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
  const replyPath = getEmailReplyPathReadiness(env);
  return [
    {
      id: 'owner_whatsapp',
      name: 'OWNER_WHATSAPP',
      status: st.whatsapp,
      detail: st.whatsapp === 'READY' ? 'configurato' : 'mancante — nessun CTA WhatsApp',
    },
    {
      id: 'owner_phone',
      name: 'OWNER_PHONE',
      status: st.phone,
      detail:
        st.phone === 'READY'
          ? 'numero collegato al pulsante Chiamami'
          : 'mancante — usa OWNER_PHONE o OWNER_WHATSAPP',
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
    {
      id: 'resend_reply_path',
      name: 'RESEND_REPLY_PATH',
      status: replyPath.ready ? 'READY' : 'MISSING',
      detail: replyPath.ready
        ? `Reply-To e ricezione configurati su ${replyPath.inboundDomain}`
        : `mancante: ${replyPath.missing.join(', ')}`,
    },
    {
      id: 'resend_webhook',
      name: 'RESEND_WEBHOOK_SECRET',
      status: env.RESEND_WEBHOOK_SECRET?.trim() ? 'READY' : 'MISSING',
      detail: env.RESEND_WEBHOOK_SECRET?.trim()
        ? 'firma webhook inbound configurata'
        : 'mancante — le email ricevute non possono essere verificate',
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
    const replyPath = getEmailReplyPathReadiness(env);
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM?.trim() || !replyPath.ready) {
      return {
        id: 'resend',
        name: 'Resend',
        status: 'not_configured',
        detail: `live incompleto: ${
          [
            !env.RESEND_API_KEY?.trim() ? 'RESEND_API_KEY' : null,
            !env.RESEND_FROM?.trim() ? 'RESEND_FROM' : null,
            ...replyPath.missing,
          ]
            .filter(Boolean)
            .join(', ')
        }`,
      };
    }
    return {
      id: 'resend',
      name: 'Resend',
      status: 'ready',
      detail: 'RESEND LIVE · invio ai destinatari della campagna',
    };
  }
  return { id: 'resend', name: 'Resend', status: 'error', detail: `mode non valido: ${mode}` };
}

function probeTelegram(env: NodeJS.ProcessEnv): ProviderStatusItem {
  const connection = getTelegramCredentialStatus(env);
  if (!connection.ready) {
    return {
      id: 'telegram',
      name: 'Telegram',
      status: connection.mode === 'mock' ? 'mock' : 'not_configured',
      detail: `configurazione incompleta: ${connection.missing.join(', ')}`,
    };
  }
  return {
    id: 'telegram',
    name: 'Telegram',
    status: 'ready',
    detail: 'credenziali pronte · avvio e arresto dalla pagina Messaggi',
  };
}

/** Single source of truth for header / operator badge. */
export function getResendRuntimeBadge(env: NodeJS.ProcessEnv = process.env): {
  label: 'RESEND MOCK' | 'RESEND LIVE' | 'RESEND ERROR';
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
    const replyPath = getEmailReplyPathReadiness(env);
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM?.trim() || !replyPath.ready) {
      return {
        label: 'RESEND ERROR',
        mode: 'error',
        detail: `mode=live ma configurazione incompleta: ${replyPath.missing.join(', ')}`,
      };
    }
    return {
      label: 'RESEND LIVE',
      mode: 'live',
      detail: 'Invio live ai destinatari della campagna dopo approvazione.',
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
      probeTelegram(env),
      staticMockProvider(
        'browser_worker',
        'Browser Worker',
        'BROWSER_WORKER_PROVIDER_MODE',
        env,
      ),
      probeAi(env),
    ],
    commercial: commercialConfig(env),
  };
}
