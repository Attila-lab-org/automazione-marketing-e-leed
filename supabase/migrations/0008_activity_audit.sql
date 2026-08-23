-- ============================================================================
-- 0008_activity_audit.sql
-- Contenuto (§16.3): activity_log — timeline append-only e Decision Trace.
-- Riferimenti: MASTER_SPEC §16.1, §16.4, §19.1, §21.1; DATABASE_MIGRATION_PLAN §11.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§11.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'actor_type') then
    create type public.actor_type as enum ('USER','SYSTEM','WORKER');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'activity_category') then
    create type public.activity_category as enum ('BUSINESS','TECHNICAL','DECISION');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella activity_log (§16.1, §19.1)
-- data jsonb = Decision Trace §19.1: lead source, dati usati, website audit
-- version, score breakdown + algorithm_version, policy version + condizioni
-- soddisfatte, demo/template/version, message template/draft/version,
-- Send Guard result, provider message ID, riferimenti webhook events.
-- ----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  actor_type    public.actor_type not null,           -- USER / SYSTEM / WORKER
  actor_user_id uuid references auth.users(id),       -- null = sistema
  entity_type   text not null,   -- es. lead, campaign, message, demo_site, job
  entity_id     uuid not null,
  lead_id       uuid references public.leads(id) on delete set null, -- shortcut Lead Timeline §7.2
  category      public.activity_category not null,    -- BUSINESS / TECHNICAL / DECISION
  event_type    text not null,   -- es. LEAD_CREATED, SCORE_COMPUTED, POLICY_DECISION,
                                 --     SEND_GUARD_RESULT, MESSAGE_SENT, KILL_SWITCH_ACTIVATED
  message       text,            -- label leggibile (UX rule §21.1: niente gergo tecnico)
  data          jsonb not null default '{}',
  occurred_at   timestamptz not null default now()
);

create index if not exists activity_log_entity_idx
  on public.activity_log (workspace_id, entity_type, entity_id, occurred_at desc);
create index if not exists activity_log_lead_idx
  on public.activity_log (lead_id, occurred_at desc);
create index if not exists activity_log_type_idx
  on public.activity_log (workspace_id, category, event_type, occurred_at desc);

-- ----------------------------------------------------------------------------
-- Append-only (§16.4: "niente update/delete ordinario")
-- 1. RLS: solo SELECT (membri) + INSERT (membri con ruolo operativo + domain
--    layer); nessuna policy UPDATE/DELETE → negate by default.
-- 2. Trigger di difesa in profondità: blocca anche service_role — la
--    correzione di errori avviene con una nuova entry compensativa, mai update.
-- ----------------------------------------------------------------------------
drop trigger if exists activity_log_append_only on public.activity_log;
create trigger activity_log_append_only
  before update or delete on public.activity_log
  for each row execute function public.forbid_mutation();

alter table public.activity_log enable row level security;
alter table public.activity_log force row level security;

drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
