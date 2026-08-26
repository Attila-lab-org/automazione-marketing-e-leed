-- ============================================================================
-- 0027_commercial_goal_core.sql
-- Outcome OS: goal persistenti, piani versionati, timeline e collegamenti.
-- Additiva; AUTOPILOT resta vincolato a policy e Send Guard applicativi.
-- ============================================================================

do $$ begin
  alter type public.job_type add value if not exists 'COMMERCIAL_GOAL_TICK';
exception when duplicate_object then null;
end $$;

create table if not exists public.commercial_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  outcome_type text not null default 'ACQUIRE_CUSTOMERS'
    check (outcome_type in ('ACQUIRE_CUSTOMERS','BOOK_APPOINTMENTS','GENERATE_REPLIES','BUILD_PIPELINE')),
  offer_key text not null,
  target_metric text not null
    check (target_metric in ('DEALS_WON','APPOINTMENTS_BOOKED','POSITIVE_REPLIES','QUALIFIED_LEADS')),
  target_value numeric not null check (target_value > 0),
  current_value numeric not null default 0 check (current_value >= 0),
  starts_at timestamptz not null default now(),
  deadline timestamptz not null,
  market jsonb not null default '{}'::jsonb,
  mode text not null default 'DO' check (mode in ('ASK','DO','AUTOPILOT')),
  status text not null default 'ACTIVE'
    check (status in ('DRAFT','ACTIVE','PAUSED','BLOCKED','COMPLETED','CANCELLED')),
  strategy jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  progress_snapshot jsonb not null default '{}'::jsonb,
  last_observed_at timestamptz,
  next_tick_at timestamptz,
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline > starts_at)
);

create unique index if not exists commercial_goals_one_active_idx
  on public.commercial_goals (workspace_id)
  where status = 'ACTIVE';
create index if not exists commercial_goals_tick_idx
  on public.commercial_goals (workspace_id, status, next_tick_at);

create table if not exists public.commercial_goal_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.commercial_goals(id) on delete cascade,
  version integer not null,
  status text not null default 'ACTIVE'
    check (status in ('DRAFT','ACTIVE','SUPERSEDED','COMPLETED','FAILED')),
  rationale text not null,
  hypotheses jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  observation_hash text not null,
  replan_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (goal_id, version)
);

create unique index if not exists commercial_goal_plans_one_active_idx
  on public.commercial_goal_plans (goal_id)
  where status = 'ACTIVE';

create table if not exists public.commercial_goal_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.commercial_goals(id) on delete cascade,
  plan_id uuid references public.commercial_goal_plans(id) on delete set null,
  actor text not null check (actor in ('AI','HUMAN','SYSTEM')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists commercial_goal_events_goal_idx
  on public.commercial_goal_events (goal_id, created_at asc);
drop trigger if exists commercial_goal_events_append_only on public.commercial_goal_events;
create trigger commercial_goal_events_append_only
  before update or delete on public.commercial_goal_events
  for each row execute function public.forbid_mutation();

create table if not exists public.commercial_goal_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.commercial_goals(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('campaign','lead','demo','thread','calendar_event','automation_job')),
  entity_id uuid not null,
  role text not null default 'CONTRIBUTOR',
  created_at timestamptz not null default now(),
  unique (goal_id, entity_type, entity_id)
);

create index if not exists commercial_goal_links_entity_idx
  on public.commercial_goal_links (entity_type, entity_id);

alter table public.leads add column if not exists primary_thread_id uuid;
do $$ begin
  alter table public.leads
    add constraint leads_primary_thread_id_fkey
    foreign key (primary_thread_id) references public.message_threads(id) on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists leads_primary_thread_idx
  on public.leads (primary_thread_id) where primary_thread_id is not null;

alter table public.message_threads
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason_code text,
  add column if not exists close_notes text,
  add column if not exists closed_by uuid references auth.users(id) on delete set null;

alter table public.commercial_goals enable row level security;
alter table public.commercial_goals force row level security;
alter table public.commercial_goal_plans enable row level security;
alter table public.commercial_goal_plans force row level security;
alter table public.commercial_goal_events enable row level security;
alter table public.commercial_goal_events force row level security;
alter table public.commercial_goal_links enable row level security;
alter table public.commercial_goal_links force row level security;

drop policy if exists commercial_goals_select on public.commercial_goals;
create policy commercial_goals_select on public.commercial_goals for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists commercial_goal_plans_select on public.commercial_goal_plans;
create policy commercial_goal_plans_select on public.commercial_goal_plans for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists commercial_goal_events_select on public.commercial_goal_events;
create policy commercial_goal_events_select on public.commercial_goal_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists commercial_goal_links_select on public.commercial_goal_links;
create policy commercial_goal_links_select on public.commercial_goal_links for select to authenticated
  using (public.is_workspace_member(workspace_id));
