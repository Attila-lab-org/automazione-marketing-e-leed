-- ============================================================================
-- 0007_automation_jobs.sql
-- Contenuto (§16.3): automation_jobs (tutti i campi §15.1), automation_job_events,
-- lease atomico claim_job (FOR UPDATE SKIP LOCKED), recover_stuck_jobs
-- (backoff esponenziale), idempotency.
-- Riferimenti: MASTER_SPEC §15, §15.1, §14 (job ownership); DATABASE_MIGRATION_PLAN §10.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§10.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum
      ('QUEUED','RUNNING','RETRYING','SUCCEEDED','FAILED','CANCELLED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'job_type') then
    create type public.job_type as enum (
      'DISCOVERY_RUN','LEAD_ENRICHMENT','WEBSITE_ANALYSIS','LEAD_SCORING',
      'DEMO_GENERATION','SCREENSHOT_DESKTOP','SCREENSHOT_MOBILE',
      'MESSAGE_GENERATION','SEND_MESSAGE','FOLLOWUP_STEP','WEBHOOK_PROCESSING'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella automation_jobs — TUTTI i campi obbligatori §15.1
-- Job persistenti, idempotenti, riprendibili (§15); lease atomici DB-level.
-- Convenzione idempotency_key: <job_type>:<entity_type>:<entity_id>:<scope>
--   es. 'SEND_MESSAGE:campaign_lead:<uuid>:step:1'
-- ----------------------------------------------------------------------------
create table if not exists public.automation_jobs (
  id                 uuid primary key default gen_random_uuid(),          -- §15.1
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  job_type           public.job_type not null,                            -- §15.1
  entity_type        text not null,     -- §15.1 es. lead, campaign_lead, demo_site, message
  entity_id          uuid not null,                                       -- §15.1
  status             public.job_status not null default 'QUEUED',         -- §15.1
  priority           integer not null default 100, -- §15.1 numero più basso = priorità più alta
  attempt_count      integer not null default 0,                          -- §15.1
  max_attempts       integer not null default 5,                          -- §15.1
  next_retry_at      timestamptz,       -- §15.1 backoff esponenziale
  lease_owner        text,              -- §15.1 worker id che detiene il lease
  lease_expires_at   timestamptz,       -- §15.1 scadenza lease
  idempotency_key    text not null,     -- §15.1 UNIQUE (indice sotto)
  input_snapshot     jsonb not null default '{}', -- §15.1 include policy snapshot quando rilevante
  result             jsonb,                                               -- §15.1
  error_code         text,                                                -- §15.1
  error_detail       text,                                                -- §15.1
  depends_on_job_id  uuid references public.automation_jobs(id), -- dependency graph §15
                     -- es. SCREENSHOT_MOBILE dopo SCREENSHOT_DESKTOP; SEND solo
                     -- dopo screenshot READY (§10.1)
  created_at         timestamptz not null default now(),                  -- §15.1
  started_at         timestamptz,                                         -- §15.1
  completed_at       timestamptz,                                         -- §15.1
  cancelled_at       timestamptz        -- cancellation §15
);

create unique index if not exists automation_jobs_idempotency_key_key
  on public.automation_jobs (idempotency_key);

create index if not exists automation_jobs_claim_idx
  on public.automation_jobs (status, next_retry_at, priority, created_at)
  where status in ('QUEUED','RETRYING');

create index if not exists automation_jobs_entity_idx
  on public.automation_jobs (entity_type, entity_id);

create index if not exists automation_jobs_workspace_status_idx
  on public.automation_jobs (workspace_id, status);

create index if not exists automation_jobs_lease_idx
  on public.automation_jobs (lease_expires_at) where status = 'RUNNING';

-- ----------------------------------------------------------------------------
-- Tabella automation_job_events (audit tecnico job §16.1) — append-only
-- ----------------------------------------------------------------------------
create table if not exists public.automation_job_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id       uuid not null references public.automation_jobs(id) on delete cascade,
  event_type   text not null check (event_type in
                 ('ENQUEUED','LEASED','HEARTBEAT','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','RECOVERED')),
  actor        text,                     -- worker id / user id / system:*
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists automation_job_events_job_idx
  on public.automation_job_events (job_id, created_at);

drop trigger if exists automation_job_events_immutable on public.automation_job_events;
create trigger automation_job_events_immutable
  before update or delete on public.automation_job_events
  for each row execute function public.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Lease atomico — claim_job (FOR UPDATE SKIP LOCKED, §10.3 piano)
-- Impedisce doppia elaborazione tra worker concorrenti. Rispetta il dependency
-- graph: un job con depends_on_job_id è claimable solo se il padre è SUCCEEDED.
-- ----------------------------------------------------------------------------
create or replace function public.claim_job(
  p_worker_id     text,
  p_job_types     public.job_type[] default null,
  p_lease_seconds integer           default 300,
  p_workspace_id  uuid              default null
)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select j.id into v_job_id
  from public.automation_jobs j
  left join public.automation_jobs dep on dep.id = j.depends_on_job_id
  where j.status in ('QUEUED','RETRYING')
    and (j.next_retry_at is null or j.next_retry_at <= now())
    and (j.lease_expires_at is null or j.lease_expires_at <= now())
    and (p_job_types is null or j.job_type = any(p_job_types))
    and (p_workspace_id is null or j.workspace_id = p_workspace_id)
    and (j.depends_on_job_id is null or dep.status = 'SUCCEEDED') -- dependency graph §15
  order by j.priority asc, j.created_at asc
  limit 1
  for update of j skip locked; -- lease atomico: nessun doppio claim

  if v_job_id is null then
    return;
  end if;

  update public.automation_jobs
  set status           = 'RUNNING',
      lease_owner      = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      started_at       = coalesce(started_at, now()),
      attempt_count    = attempt_count + 1
  where id = v_job_id;

  insert into public.automation_job_events (workspace_id, job_id, event_type, actor, payload)
  select workspace_id, id, 'LEASED', p_worker_id,
         jsonb_build_object('lease_seconds', p_lease_seconds, 'attempt', attempt_count)
  from public.automation_jobs
  where id = v_job_id;

  return query select * from public.automation_jobs where id = v_job_id;
end $$;

-- Solo service_role può eseguire il claim (worker server-side §14: Supabase
-- conserva lo stato ufficiale dei job).
revoke all on function public.claim_job(text, public.job_type[], integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_job(text, public.job_type[], integer, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Recovery job bloccati — recover_stuck_jobs (§10.4 piano)
-- Job RUNNING con lease scaduto → RETRYING con backoff esponenziale
-- (base * 2^attempt_count), oppure FAILED a max_attempts.
-- Eseguita periodicamente (cron esterno / scheduled function / endpoint admin).
-- ----------------------------------------------------------------------------
create or replace function public.recover_stuck_jobs(
  p_backoff_base_seconds integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with recovered as (
    update public.automation_jobs
    set status        = case when attempt_count >= max_attempts
                             then 'FAILED'::public.job_status
                             else 'RETRYING'::public.job_status end,
        next_retry_at = case when attempt_count >= max_attempts
                             then null
                             else now() + make_interval(
                                    secs => p_backoff_base_seconds * power(2, attempt_count)::int
                                  ) end,
        lease_owner   = null,
        error_code    = coalesce(error_code, 'LEASE_EXPIRED'),
        error_detail  = coalesce(error_detail,
                          'Lease scaduto senza completamento: job recuperato dallo scheduler')
    where status = 'RUNNING'
      and lease_expires_at < now()
    returning id, workspace_id, status, attempt_count, next_retry_at
  ), events as (
    insert into public.automation_job_events (workspace_id, job_id, event_type, actor, payload)
    select workspace_id, id,
           case when status = 'FAILED' then 'FAILED' else 'RETRY_SCHEDULED' end,
           'system:recover_stuck_jobs',
           jsonb_build_object('attempt_count', attempt_count, 'next_retry_at', next_retry_at)
    from recovered
    returning job_id
  )
  select count(*) into v_count from events;

  return v_count;
end $$;

revoke all on function public.recover_stuck_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stuck_jobs(integer) to service_role;

-- ----------------------------------------------------------------------------
-- RLS 0007 (§10.6 piano)
-- - automation_jobs: SELECT per tutti i membri (voce Automations §6.1);
--   NESSUNA policy INSERT/UPDATE/DELETE per authenticated → enqueue/claim/
--   complete/fail solo via service_role server-side.
-- - automation_job_events: SELECT per membri; insert solo service_role;
--   append-only (trigger).
-- ----------------------------------------------------------------------------
alter table public.automation_jobs enable row level security;
alter table public.automation_jobs force row level security;
alter table public.automation_job_events enable row level security;
alter table public.automation_job_events force row level security;

drop policy if exists automation_jobs_select on public.automation_jobs;
create policy automation_jobs_select on public.automation_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists automation_job_events_select on public.automation_job_events;
create policy automation_job_events_select on public.automation_job_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
