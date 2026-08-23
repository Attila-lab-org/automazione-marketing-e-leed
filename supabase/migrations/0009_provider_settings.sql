-- ============================================================================
-- 0009_provider_settings.sql
-- Contenuto (§16.3): provider_connections (metadata, MAI secret),
-- workspace_feature_flags (kill switch §19.2 + feature flags).
-- Riferimenti: MASTER_SPEC §18, §19.2, §23.1; DATABASE_MIGRATION_PLAN §12.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§12.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'provider_type') then
    create type public.provider_type as enum ('GOOGLE_PLACES','RESEND','BROWSER_WORKER','AI');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'provider_mode') then
    create type public.provider_mode as enum ('MOCK','LIVE');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'connection_status') then
    create type public.connection_status as enum
      ('NOT_CONFIGURED','CONNECTED','DEGRADED','DISABLED');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella provider_connections (stato provider + metadata §16.1)
-- display_config contiene SOLO metadata non sensibili (dominio mittente, from
-- address, modello AI, endpoint webhook, capabilities). Nessuna API key/secret:
-- i secret vivono in env/secret store server-side (§18, §1 piano).
-- status = 'DISABLED' = kill switch "Disable Provider" §19.2.
-- ----------------------------------------------------------------------------
create table if not exists public.provider_connections (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  provider         public.provider_type not null,
  mode             public.provider_mode not null default 'MOCK', -- mock by default §23.1
  status           public.connection_status not null default 'NOT_CONFIGURED',
  display_config   jsonb not null default '{}',
  last_verified_at timestamptz,          -- verifica credenziali onboarding §6.2 step 2-3
  last_error       text,                 -- health §21 Provider Status
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, provider)
);

drop trigger if exists provider_connections_set_updated_at on public.provider_connections;
create trigger provider_connections_set_updated_at
  before update on public.provider_connections
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella workspace_feature_flags (kill switch §19.2 + feature flags §16.3)
-- Chiavi kill switch riservate:
--   OUTREACH_PAUSED_ALL    → PAUSE ALL OUTREACH: blocca subito nuovi send/follow-up
--   DISCOVERY_PAUSED       → Pause Discovery: nessun nuovo job Google
--   BROWSER_WORKERS_PAUSED → Pause Browser Workers: nessun job analysis/screenshot
-- (Disable Provider = provider_connections.status='DISABLED';
--  Pause Campaign  = campaigns.status='PAUSED')
-- Il check dei flag avviene server-side nel Policy Engine / Job Orchestrator
-- prima di enqueue e nel Send Guard prima di ogni send. Ogni attivazione scrive
-- KILL_SWITCH_ACTIVATED / KILL_SWITCH_RELEASED in activity_log (auditability §1).
-- ----------------------------------------------------------------------------
create table if not exists public.workspace_feature_flags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null,
  value        jsonb not null, -- es. {"enabled": true, "reason": "...", "set_by": "<user_id>"}
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, key)
);

drop trigger if exists workspace_feature_flags_set_updated_at on public.workspace_feature_flags;
create trigger workspace_feature_flags_set_updated_at
  before update on public.workspace_feature_flags
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS 0009 (§12.4 piano)
-- - provider_connections: SELECT tutti i membri (Provider Status §21);
--   INSERT/UPDATE/DELETE solo Owner/Admin. Non contenendo secret, la lettura
--   Operator/Viewer è sicura.
-- - workspace_feature_flags: SELECT membri; INSERT/UPDATE solo Owner/Admin
--   (kill switch = azione privilegiata con Danger Zone Modal §21). Nessuna
--   DELETE da client.
-- ----------------------------------------------------------------------------
alter table public.provider_connections enable row level security;
alter table public.provider_connections force row level security;
alter table public.workspace_feature_flags enable row level security;
alter table public.workspace_feature_flags force row level security;

drop policy if exists provider_connections_select on public.provider_connections;
create policy provider_connections_select on public.provider_connections for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists provider_connections_insert on public.provider_connections;
create policy provider_connections_insert on public.provider_connections for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
drop policy if exists provider_connections_update on public.provider_connections;
create policy provider_connections_update on public.provider_connections for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
drop policy if exists provider_connections_delete on public.provider_connections;
create policy provider_connections_delete on public.provider_connections for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

drop policy if exists workspace_feature_flags_select on public.workspace_feature_flags;
create policy workspace_feature_flags_select on public.workspace_feature_flags for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists workspace_feature_flags_insert on public.workspace_feature_flags;
create policy workspace_feature_flags_insert on public.workspace_feature_flags for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
drop policy if exists workspace_feature_flags_update on public.workspace_feature_flags;
create policy workspace_feature_flags_update on public.workspace_feature_flags for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
