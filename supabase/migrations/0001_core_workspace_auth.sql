-- ============================================================================
-- 0001_core_workspace_auth.sql
-- Sales Automation OS — Phase 1 Foundation
-- Contenuto (§16.3): workspaces, workspace_members, enum globali, RLS base,
-- helper RLS security definer, utility trigger condivise.
-- Riferimenti: MASTER_SPEC §3.1, §4, §4.1, §16.2-16.4; DATABASE_MIGRATION_PLAN §3-4.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Estensioni (§1 piano: pgcrypto default Supabase, pg_trgm per fuzzy name match
-- SOLO come segnale di dedupe §13.2 punto 5 — mai merge automatico su fuzzy)
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Enum globali (§3 piano). CREATE TYPE non supporta IF NOT EXISTS: uso DO block
-- per rendere la migration rieseguibile senza errori.
-- ----------------------------------------------------------------------------

-- §16.4 — ruoli workspace
do $$ begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
  end if;
end $$;

-- §4 — modalità operativa. Default sicuro ovunque: 'MANUAL' (safe-by-default §1;
-- Full Auto non è mai pre-selezionato §6.2 step 6)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'policy_mode') then
    create type public.policy_mode as enum ('MANUAL', 'SCORE_BASED', 'FULL_AUTO');
  end if;
end $$;

-- §4.1 — gate granulare per singola azione
-- discovery/enrichment/analysis/screenshot/message → AUTO|MANUAL
-- demo → AUTO|SCORE_THRESHOLD|MANUAL ; send → MANUAL|SCORE_THRESHOLD|AUTO
-- follow-up → OFF|MANUAL|AUTO
do $$ begin
  if not exists (select 1 from pg_type where typname = 'policy_gate_mode') then
    create type public.policy_gate_mode as enum ('AUTO', 'SCORE_THRESHOLD', 'MANUAL', 'OFF');
  end if;
end $$;

-- §3.1 — business status (separato da processing_status)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'business_status') then
    create type public.business_status as enum (
      'NEW', 'QUALIFIED', 'CAMPAIGN_READY', 'CONTACTED', 'REPLIED',
      'INTERESTED', 'WON', 'LOST', 'NOT_INTERESTED', 'SUPPRESSED'
    );
  end if;
end $$;

-- §3.1 — processing status (separato da business_status)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'processing_status') then
    create type public.processing_status as enum (
      'IDLE', 'ENRICHING', 'ANALYZING', 'SCORING', 'DEMO_GENERATING',
      'SCREENSHOT_GENERATING', 'MESSAGE_GENERATING', 'SENDING', 'FAILED'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Funzioni utility condivise
-- ----------------------------------------------------------------------------

-- Aggiorna updated_at su UPDATE (convenzione §1 piano)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Guardia immutabilità (§4.1 POLICY SNAPSHOT, §11 "Sent message", §16.4 append-only).
-- NOTA ORDINE: il piano la descrive in §8.3 (migration 0005), ma serve già in
-- 0004 per website_template_versions/demo_versions → creata qui una sola volta
-- e riusata dalle migration successive.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabella append-only/versionata: UPDATE/DELETE vietati su %', tg_table_name;
end $$;

-- Guardia immutabilità condizionale: blocca UPDATE/DELETE solo se la versione è
-- già pubblicata (§9: versioni immutabili dopo publish)
create or replace function public.forbid_mutation_if_published()
returns trigger
language plpgsql
as $$
begin
  if old.is_published then
    raise exception 'Versione pubblicata immutabile su % (§9): creare una nuova versione', tg_table_name;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella workspaces (§4.2 piano)
-- ----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  default_policy_mode public.policy_mode not null default 'MANUAL', -- safe-by-default §1
  default_policy      jsonb not null default '{}',                  -- policy workspace-level §4.1
  settings            jsonb not null default '{}',                  -- retention, rate limit, flag non-segreti (§18)
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella workspace_members (§4.3 piano)
-- ----------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  role         public.workspace_role not null default 'VIEWER',
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Funzioni helper RLS (§4.4 piano) — SECURITY DEFINER per evitare ricorsione
-- su workspace_members quando le policy di workspace_members stesse le invocano.
-- ----------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_roles        public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = any(p_roles)
  );
$$;

-- Costanti riusabili nelle policy:
--   array['OWNER','ADMIN']::workspace_role[]             -> write amministrativa
--   array['OWNER','ADMIN','OPERATOR']::workspace_role[]  -> write operativa

-- Gli helper sono invocati dalle policy RLS, valutate come l'utente chiamante:
-- authenticated (e service_role) devono mantenere EXECUTE. Revocato solo anon
-- (e public: il grant esplicito sotto copre i ruoli che ne hanno bisogno).
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, public.workspace_role[]) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS 0001 (§4.5 piano)
-- ----------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['OWNER','ADMIN']::public.workspace_role[]));

-- Nessuna DELETE su workspaces da client: solo service_role server-side.

drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists members_insert on public.workspace_members;
create policy members_insert on public.workspace_members
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

drop policy if exists members_update on public.workspace_members;
create policy members_update on public.workspace_members
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

drop policy if exists members_delete on public.workspace_members;
create policy members_delete on public.workspace_members
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER']::public.workspace_role[]));

-- Il ruolo service_role bypassa RLS per costruzione Supabase: la service key
-- resta solo server-side (§11.2, §18) e non viene mai esposta al client.
