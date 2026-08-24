-- Canali inbound social/chat: fonti lead + dedupe Telegram.
-- Discord/Mastodon/Bluesky restano riservati (non ancora implementati).

alter table public.lead_sources drop constraint if exists lead_sources_source_type_check;
alter table public.lead_sources
  add constraint lead_sources_source_type_check
  check (source_type in (
    'GOOGLE_PLACES_DISCOVERY',
    'GOOGLE_PLACES_ENRICHMENT',
    'WEBSITE_ANALYSIS',
    'MANUAL',
    'IMPORT',
    'FACEBOOK',
    'TELEGRAM_INBOUND',
    'DISCORD_INBOUND',
    'MASTODON_INBOUND',
    'BLUESKY_INBOUND'
  ));

-- Dedupe: un solo lead per utente Telegram (external_id = telegram user id)
create unique index if not exists lead_sources_telegram_external_key
  on public.lead_sources (workspace_id, source_type, external_id)
  where source_type = 'TELEGRAM_INBOUND' and external_id is not null;

-- Contatto Telegram: value = @username oppure tg:123456
create index if not exists lead_contacts_telegram_dedupe_idx
  on public.lead_contacts (workspace_id, type, normalized_value)
  where type = 'OTHER' and source = 'TELEGRAM';

-- Un solo thread inbound (senza campagna) per lead
create unique index if not exists message_threads_inbound_lead_key
  on public.message_threads (workspace_id, lead_id)
  where campaign_id is null;
