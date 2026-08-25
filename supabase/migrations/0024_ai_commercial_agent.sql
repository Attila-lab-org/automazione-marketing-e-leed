-- ============================================================================
-- 0024_ai_commercial_agent.sql
-- AI-2..AI-5: website analyses, playbook, sales thread fields, memory,
-- pending actions, action audit, autonomy policies.
-- Additive. Non droppa tabelle esistenti. Non abilita invii autonomi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- message_threads: canale + stato commerciale (reuse, no seconda inbox)
-- ----------------------------------------------------------------------------
alter table public.message_threads
  add column if not exists channel text not null default 'EMAIL',
  add column if not exists commercial_state text not null default 'NEW',
  add column if not exists assigned_mode text not null default 'AI',
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists sentiment text,
  add column if not exists next_step text,
  add column if not exists next_step_at timestamptz,
  add column if not exists human_required_reason text,
  add column if not exists playbook_version integer;

alter table public.message_threads drop constraint if exists message_threads_channel_check;
alter table public.message_threads
  add constraint message_threads_channel_check
  check (channel in ('EMAIL', 'TELEGRAM'));

alter table public.message_threads drop constraint if exists message_threads_commercial_state_check;
alter table public.message_threads
  add constraint message_threads_commercial_state_check
  check (commercial_state in (
    'NEW','CONTACTED','REPLIED','ENGAGED','QUALIFYING','INTERESTED','PRICING',
    'CALL_PROPOSED','CALL_BOOKED','FOLLOW_UP_LATER','HUMAN_REQUIRED',
    'WON','LOST','NOT_INTERESTED','UNSUBSCRIBED'
  ));

alter table public.message_threads drop constraint if exists message_threads_assigned_mode_check;
alter table public.message_threads
  add constraint message_threads_assigned_mode_check
  check (assigned_mode in ('AI', 'HUMAN'));

alter table public.message_threads drop constraint if exists message_threads_priority_check;
alter table public.message_threads
  add constraint message_threads_priority_check
  check (priority in ('LOW', 'NORMAL', 'HIGH', 'HOT'));

update public.message_threads t
set channel = 'TELEGRAM'
where exists (
  select 1 from public.messages m
  where m.thread_id = t.id and m.provider = 'telegram'
);

update public.message_threads t
set commercial_state = 'REPLIED'
where commercial_state = 'NEW'
  and exists (
    select 1 from public.messages m
    where m.thread_id = t.id and m.direction = 'INBOUND'
  );

create index if not exists message_threads_commercial_idx
  on public.message_threads (workspace_id, commercial_state, assigned_mode, last_message_at desc);

-- ----------------------------------------------------------------------------
-- website_analyses (AI opportunity, evidence-backed)
-- ----------------------------------------------------------------------------
create table if not exists public.website_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  website_audit_id uuid references public.website_audits(id) on delete set null,
  website_url text,
  retrieved_text_hash text,
  opportunity_score integer check (opportunity_score between 0 and 100),
  confidence numeric(4,3) check (confidence >= 0 and confidence <= 1),
  visual_quality text not null default 'unknown',
  mobile_clarity text not null default 'unknown',
  cta_clarity text not null default 'unknown',
  booking_clarity text not null default 'unknown',
  trust_presentation text not null default 'unknown',
  strengths jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  recommended_offer text,
  recommended_approach text,
  human_review_required boolean not null default false,
  analysis jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  prompt_version text not null default 'website-analysis-v1',
  schema_version text not null default 'website-analysis-v1',
  created_at timestamptz not null default now()
);

create index if not exists website_analyses_lead_created_idx
  on public.website_analyses (lead_id, created_at desc);

create index if not exists website_analyses_workspace_created_idx
  on public.website_analyses (workspace_id, created_at desc);

-- ----------------------------------------------------------------------------
-- commercial_playbooks
-- ----------------------------------------------------------------------------
create table if not exists public.commercial_playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null default 1,
  is_current boolean not null default true,
  brand jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  discount jsonb not null default '{}'::jsonb,
  qualification jsonb not null default '{}'::jsonb,
  call_policy jsonb not null default '{}'::jsonb,
  promise_policy jsonb not null default '{}'::jsonb,
  human_escalation jsonb not null default '{}'::jsonb,
  autonomy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commercial_playbooks_current_idx
  on public.commercial_playbooks (workspace_id)
  where is_current = true;

-- ----------------------------------------------------------------------------
-- sales_thread_memory / events
-- ----------------------------------------------------------------------------
create table if not exists public.sales_thread_memory (
  thread_id uuid primary key references public.message_threads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_summary text,
  main_need text,
  services_requested jsonb not null default '[]'::jsonb,
  budget_signal text,
  pricing_discussed boolean not null default false,
  objections jsonb not null default '[]'::jsonb,
  decision_maker_status text,
  timing text,
  preferred_channel text,
  sentiment text,
  last_commitment text,
  next_step text,
  next_step_at timestamptz,
  risk_flags jsonb not null default '[]'::jsonb,
  human_notes text,
  prompt_version text not null default 'sales-memory-v1',
  updated_at timestamptz not null default now()
);

create index if not exists sales_thread_memory_workspace_idx
  on public.sales_thread_memory (workspace_id, updated_at desc);

create table if not exists public.sales_thread_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  actor text not null check (actor in ('AI', 'HUMAN', 'SYSTEM')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_thread_events_thread_idx
  on public.sales_thread_events (thread_id, created_at asc);

-- ----------------------------------------------------------------------------
-- pending_ai_actions (external confirmation; model cannot mutate after save)
-- ----------------------------------------------------------------------------
create table if not exists public.pending_ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  actor text not null check (actor in ('AI', 'HUMAN', 'SYSTEM')),
  tool text not null,
  params jsonb not null,
  payload_hash text not null,
  target_summary jsonb not null default '{}'::jsonb,
  policy_state jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'executed', 'expired')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists pending_ai_actions_idempotency_idx
  on public.pending_ai_actions (workspace_id, idempotency_key);

create index if not exists pending_ai_actions_status_idx
  on public.pending_ai_actions (workspace_id, status, expires_at);

-- ----------------------------------------------------------------------------
-- ai_action_audit
-- ----------------------------------------------------------------------------
create table if not exists public.ai_action_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor text not null check (actor in ('AI', 'HUMAN', 'SYSTEM')),
  tool text not null,
  entity_type text,
  entity_id uuid,
  action text not null,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  policy jsonb not null default '{}'::jsonb,
  confirmation_id uuid references public.pending_ai_actions(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_action_audit_workspace_idx
  on public.ai_action_audit (workspace_id, created_at desc);

create index if not exists ai_action_audit_entity_idx
  on public.ai_action_audit (entity_type, entity_id, created_at desc)
  where entity_id is not null;

-- ----------------------------------------------------------------------------
-- ai_autonomy_policies
-- ----------------------------------------------------------------------------
create table if not exists public.ai_autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Default',
  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'active', 'disabled')),
  proposal jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  playbook_version integer,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists ai_autonomy_policies_workspace_idx
  on public.ai_autonomy_policies (workspace_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- ai_runs: prompt versioning
-- ----------------------------------------------------------------------------
alter table public.ai_runs
  add column if not exists prompt_version text;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.website_analyses enable row level security;
alter table public.website_analyses force row level security;
alter table public.commercial_playbooks enable row level security;
alter table public.commercial_playbooks force row level security;
alter table public.sales_thread_memory enable row level security;
alter table public.sales_thread_memory force row level security;
alter table public.sales_thread_events enable row level security;
alter table public.sales_thread_events force row level security;
alter table public.pending_ai_actions enable row level security;
alter table public.pending_ai_actions force row level security;
alter table public.ai_action_audit enable row level security;
alter table public.ai_action_audit force row level security;
alter table public.ai_autonomy_policies enable row level security;
alter table public.ai_autonomy_policies force row level security;

drop policy if exists website_analyses_select on public.website_analyses;
create policy website_analyses_select on public.website_analyses
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists commercial_playbooks_select on public.commercial_playbooks;
create policy commercial_playbooks_select on public.commercial_playbooks
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists sales_thread_memory_select on public.sales_thread_memory;
create policy sales_thread_memory_select on public.sales_thread_memory
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists sales_thread_events_select on public.sales_thread_events;
create policy sales_thread_events_select on public.sales_thread_events
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists pending_ai_actions_select on public.pending_ai_actions;
create policy pending_ai_actions_select on public.pending_ai_actions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists ai_action_audit_select on public.ai_action_audit;
create policy ai_action_audit_select on public.ai_action_audit
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists ai_autonomy_policies_select on public.ai_autonomy_policies;
create policy ai_autonomy_policies_select on public.ai_autonomy_policies
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
