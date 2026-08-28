import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export const TELEGRAM_SETTINGS_KEY = 'TELEGRAM_INBOUND_SETTINGS';

export type TelegramKeywordGroups = {
  website: string[];
  ecommerce: string[];
  digitalPresence: string[];
  quote: string[];
};

/**
 * Modalità operativa unica:
 * - stopped: ascolto spento
 * - auto_guarded: Attila risponde automaticamente se i controlli passano
 * - manual: ascolto attivo, bozze da approvare (niente invio AI)
 *
 * `replyEnabled` controlla davvero l’invio AI (non solo il template legacy).
 */
export type TelegramOperationalMode = 'stopped' | 'auto_guarded' | 'manual';

export type TelegramInboundSettings = {
  enabled: boolean;
  /** true = automatico protetto; false = gestione manuale (se enabled). */
  replyEnabled: boolean;
  replyTemplate: string;
  keywords: TelegramKeywordGroups;
  updatedAt: string | null;
};

export function resolveTelegramOperationalMode(
  settings: Pick<TelegramInboundSettings, 'enabled' | 'replyEnabled'>,
): TelegramOperationalMode {
  if (!settings.enabled) return 'stopped';
  return settings.replyEnabled ? 'auto_guarded' : 'manual';
}

export const DEFAULT_TELEGRAM_SETTINGS: TelegramInboundSettings = {
  enabled: false,
  replyEnabled: true,
  replyTemplate:
    '{nome}, ho visto la tua richiesta per {richiesta}. Sono {studio}: possiamo aiutarti senza impegno. Scrivimi in privato e ti rispondiamo noi.',
  keywords: {
    website: [
      'sito web',
      'sito internet',
      'fare un sito',
      'creare un sito',
      'realizzare un sito',
      'nuovo sito',
      'rifare il sito',
      'rifacimento sito',
      'landing page',
      'pagina web',
    ],
    ecommerce: [
      'ecommerce',
      'e-commerce',
      'e commerce',
      'negozio online',
      'shop online',
      'vendere online',
      'carrello',
      'woocommerce',
      'shopify',
    ],
    digitalPresence: [
      'presenza online',
      'presenza digitale',
      'vetrina online',
      'visibilità online',
      'google business',
      'profilo online',
    ],
    quote: [
      'preventivo',
      'quanto costa',
      'costo sito',
      'prezzo sito',
      'cerco qualcuno',
      'mi serve un',
    ],
  },
  updatedAt: null,
};

function cleanKeywords(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 100);
}

export function normalizeTelegramSettings(value: unknown): TelegramInboundSettings {
  const input =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const keywords =
    input.keywords && typeof input.keywords === 'object'
      ? (input.keywords as Record<string, unknown>)
      : {};
  const template =
    typeof input.replyTemplate === 'string'
      ? input.replyTemplate.trim().slice(0, 1000)
      : DEFAULT_TELEGRAM_SETTINGS.replyTemplate;

  return {
    enabled: input.enabled === true,
    replyEnabled: input.replyEnabled !== false,
    replyTemplate: template || DEFAULT_TELEGRAM_SETTINGS.replyTemplate,
    keywords: {
      website: cleanKeywords(
        keywords.website,
        DEFAULT_TELEGRAM_SETTINGS.keywords.website,
      ),
      ecommerce: cleanKeywords(
        keywords.ecommerce,
        DEFAULT_TELEGRAM_SETTINGS.keywords.ecommerce,
      ),
      digitalPresence: cleanKeywords(
        keywords.digitalPresence,
        DEFAULT_TELEGRAM_SETTINGS.keywords.digitalPresence,
      ),
      quote: cleanKeywords(keywords.quote, DEFAULT_TELEGRAM_SETTINGS.keywords.quote),
    },
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}

export async function getTelegramInboundSettings(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<TelegramInboundSettings> {
  const { data, error } = await admin
    .from('workspace_feature_flags')
    .select('value')
    .eq('workspace_id', workspaceId)
    .eq('key', TELEGRAM_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(`Impostazioni Telegram: ${error.message}`);
  return normalizeTelegramSettings(data?.value);
}

export async function saveTelegramInboundSettings(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: TelegramInboundSettings,
): Promise<TelegramInboundSettings> {
  const settings = normalizeTelegramSettings({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  const { error } = await admin.from('workspace_feature_flags').upsert(
    {
      workspace_id: workspaceId,
      key: TELEGRAM_SETTINGS_KEY,
      value: settings,
    },
    { onConflict: 'workspace_id,key' },
  );
  if (error) throw new Error(`Salvataggio Telegram: ${error.message}`);
  return settings;
}
