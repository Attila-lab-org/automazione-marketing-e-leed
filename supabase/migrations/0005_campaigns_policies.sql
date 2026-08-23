-- ============================================================================
-- 0005_campaigns_policies.sql
-- Contenuto (§16.3): campaigns, campaign_leads, campaign_policy_versions,
-- followup_sequences, followup_sequence_versions.
-- Riferimenti: MASTER_SPEC §4, §4.1, §8.1, §12.2; DATABASE_MIGRATION_PLAN §8.
--
-- NOTE ORDINE FK (dipendenze circolari risolte esplicitamente):
-- 1. campaigns.active_policy_version_id → campaign_policy_versions: FK aggiunta
--    via ALTER TABLE dopo la creazione di campaign_policy_versions.
-- 2. campaigns.message_template_id / message_template_version_id → tabelle di
--    0006_messaging: colonne create qui, vincoli FK aggiunti in 0006
--    (il piano §14 assegna message_templates a 0006).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§8.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'campaign_lead_status') then
    create type public.campaign_lead_status as enum (
      'PENDING','GENERATING','READY','REVIEW','APPROVED','SENDING','SENT',
      'REPLIED','STOPPED','FAILED','SKIPPED'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- followup_sequences / followup_sequence_versions (§12.2)
-- ----------------------------------------------------------------------------
create table if not exists public.followup_sequences (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

drop trigger if exists followup_sequences_set_updated_at on public.followup_sequences;
create trigger followup_sequences_set_updated_at
  before update on public.followup_sequences
  for each row execute function public.set_updated_at();

create table if not exists public.followup_sequence_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id  uuid not null references public.followup_sequences(id) on delete cascade,
  version      integer not null,
  steps        jsonb not null default '[]', -- [{step, delay_days, message_template_version_id, conditions}]
  created_at   timestamptz not null default now(),
  unique (sequence_id, version)
);

-- Versioni immutabili (§8.2 piano): forbid_mutation creata in 0001
drop trigger if exists followup_sequence_versions_immutable on public.followup_sequence_versions;
create trigger followup_sequence_versions_immutable
  before update or delete on public.followup_sequence_versions
  for each row execute function public.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Tabella campaigns (§8.1 spec, §8.4 piano)
-- mode default 'MANUAL': MAI default FULL_AUTO (§1 safe-by-default)
-- ----------------------------------------------------------------------------
create table if not exists public.campaigns (
  id                            uuid primary key default gen_random_uuid(),
  workspace_id                  uuid not null references public.workspaces(id) on delete cascade,
  name                          text not null,
  description                   text,
  segment_id                    uuid references public.segments(id) on delete set null, -- segmento sorgente §5.3
  landing_template_id           uuid references public.website_templates(id),
  landing_template_version_id   uuid references public.website_template_versions(id),
  message_template_id           uuid, -- FK → message_templates aggiunta in 0006
  message_template_version_id   uuid, -- FK → message_template_versions aggiunta in 0006
  followup_sequence_id          uuid references public.followup_sequences(id),
  followup_sequence_version_id  uuid references public.followup_sequence_versions(id),
  mode                          public.policy_mode not null default 'MANUAL',
  active_policy_version_id      uuid, -- FK → campaign_policy_versions aggiunta sotto (circolare)
  status                        public.campaign_status not null default 'DRAFT',
  rate_limit_per_hour           integer,
  daily_send_limit              integer,
  send_window                   jsonb not null default '{}', -- finestra oraria §8.1 step 7
  activated_at                  timestamptz,
  paused_at                     timestamptz,               -- Pause Campaign §19.2
  created_by                    uuid references auth.users(id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists campaigns_workspace_status_idx on public.campaigns (workspace_id, status);

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella campaign_policy_versions — policy IMMUTABILI/versionate (§4.1)
-- actions jsonb: gate granulari §4.1 {discovery, enrichment, website_analysis,
--   demo_generation, screenshot, message_generation, send, followup}
-- thresholds jsonb: soglie SCORE_BASED (es. §5.2 opportunity ≥ 85,
--   data_confidence ≥ 85, contactability ≥ 80, valid_email, business_status)
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_policy_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  version      integer not null,
  mode         public.policy_mode not null,
  actions      jsonb not null,
  thresholds   jsonb not null default '{}',
  rate_limit   jsonb not null default '{}',    -- per workspace/campaign/provider §18
  send_window  jsonb not null default '{}',
  daily_limit  integer,
  is_active    boolean not null default false, -- una sola versione attiva per campaign
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (campaign_id, version)
);

-- Una sola versione attiva per campaign
create unique index if not exists campaign_policy_versions_active_key
  on public.campaign_policy_versions (campaign_id) where is_active;

-- IMMUTABILITÀ (§4.1 POLICY SNAPSHOT): qualunque UPDATE/DELETE solleva
-- eccezione — una nuova configurazione policy = una NUOVA riga versione.
-- Il trigger blocca anche service_role (difesa in profondità).
drop trigger if exists campaign_policy_versions_immutable on public.campaign_policy_versions;
create trigger campaign_policy_versions_immutable
  before update or delete on public.campaign_policy_versions
  for each row execute function public.forbid_mutation();

-- FK circolare risolta: campaigns.active_policy_version_id → campaign_policy_versions
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'campaigns_active_policy_version_id_fkey'
  ) then
    alter table public.campaigns
      add constraint campaigns_active_policy_version_id_fkey
      foreign key (active_policy_version_id) references public.campaign_policy_versions(id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella campaign_leads — membership, state, policy snapshot (§4.1, §8.5 piano)
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_leads (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  status            public.campaign_lead_status not null default 'PENDING',
  policy_version_id uuid not null references public.campaign_policy_versions(id),
  policy_snapshot   jsonb not null,  -- copia completa e immutabile della policy alla materializzazione
  sequence_step     integer not null default 0,
  next_action_at    timestamptz,     -- schedulazione prossima azione (follow-up §12.2)
  demo_site_id      uuid references public.demo_sites(id) on delete set null,
  approved_by       uuid references auth.users(id), -- gate umano (Review Queue §8.2)
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists campaign_leads_campaign_status_idx on public.campaign_leads (campaign_id, status);
create index if not exists campaign_leads_lead_idx on public.campaign_leads (lead_id);
create index if not exists campaign_leads_scheduling_idx
  on public.campaign_leads (workspace_id, status, next_action_at);

drop trigger if exists campaign_leads_set_updated_at on public.campaign_leads;
create trigger campaign_leads_set_updated_at
  before update on public.campaign_leads
  for each row execute function public.set_updated_at();

-- Immutabilità snapshot (§4.1): vietata la modifica di policy_snapshot e
-- policy_version_id dopo l'insert — sopravvive a modifiche/disattivazioni
-- della policy version.
create or replace function public.campaign_leads_snapshot_guard()
returns trigger
language plpgsql
as $$
begin
  if new.policy_snapshot is distinct from old.policy_snapshot
     or new.policy_version_id is distinct from old.policy_version_id then
    raise exception 'policy snapshot immutabile su campaign_leads (§4.1)';
  end if;
  return new;
end $$;

drop trigger if exists campaign_leads_snapshot_guard on public.campaign_leads;
create trigger campaign_leads_snapshot_guard
  before update on public.campaign_leads
  for each row execute function public.campaign_leads_snapshot_guard();

-- ----------------------------------------------------------------------------
-- RLS 0005 — pattern standard §5.4 piano.
-- Eccezione campaign_policy_versions (§15 piano): solo SELECT + INSERT;
-- nessuna policy UPDATE/DELETE (negate by default) + trigger immutabilità
-- per TUTTI i ruoli, service_role incluso.
-- L'attivazione Full Auto è validata nel domain layer con conferma esplicita
-- (§8.1 step 9): la policy DB non distingue i mode.
-- ----------------------------------------------------------------------------
alter table public.followup_sequences enable row level security;
alter table public.followup_sequences force row level security;
alter table public.followup_sequence_versions enable row level security;
alter table public.followup_sequence_versions force row level security;
alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;
alter table public.campaign_policy_versions enable row level security;
alter table public.campaign_policy_versions force row level security;
alter table public.campaign_leads enable row level security;
alter table public.campaign_leads force row level security;

-- followup_sequences
drop policy if exists followup_sequences_select on public.followup_sequences;
create policy followup_sequences_select on public.followup_sequences for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists followup_sequences_insert on public.followup_sequences;
create policy followup_sequences_insert on public.followup_sequences for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists followup_sequences_update on public.followup_sequences;
create policy followup_sequences_update on public.followup_sequences for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists followup_sequences_delete on public.followup_sequences;
create policy followup_sequences_delete on public.followup_sequences for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- followup_sequence_versions
drop policy if exists followup_sequence_versions_select on public.followup_sequence_versions;
create policy followup_sequence_versions_select on public.followup_sequence_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists followup_sequence_versions_insert on public.followup_sequence_versions;
create policy followup_sequence_versions_insert on public.followup_sequence_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
-- nessuna UPDATE/DELETE: versioni immutabili (trigger)

-- campaigns
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- campaign_policy_versions: SELECT + INSERT soltanto (immutabile, §15 piano)
drop policy if exists campaign_policy_versions_select on public.campaign_policy_versions;
create policy campaign_policy_versions_select on public.campaign_policy_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists campaign_policy_versions_insert on public.campaign_policy_versions;
create policy campaign_policy_versions_insert on public.campaign_policy_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));

-- campaign_leads
drop policy if exists campaign_leads_select on public.campaign_leads;
create policy campaign_leads_select on public.campaign_leads for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists campaign_leads_insert on public.campaign_leads;
create policy campaign_leads_insert on public.campaign_leads for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists campaign_leads_update on public.campaign_leads;
create policy campaign_leads_update on public.campaign_leads for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists campaign_leads_delete on public.campaign_leads;
create policy campaign_leads_delete on public.campaign_leads for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
