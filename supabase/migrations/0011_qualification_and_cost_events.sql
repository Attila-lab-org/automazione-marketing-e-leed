-- ============================================================================
-- 0011_qualification_and_cost_events.sql
-- Phase B: discovery qualification fields on leads + minimal cost_events.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'qualification_status') then
    create type public.qualification_status as enum (
      'NEW', 'PREQUALIFIED', 'NEEDS_ANALYSIS', 'LOW_PRIORITY', 'REJECTED'
    );
  end if;
end $$;

alter table public.leads
  add column if not exists discovery_score integer check (discovery_score is null or discovery_score between 0 and 100),
  add column if not exists discovery_confidence integer check (discovery_confidence is null or discovery_confidence between 0 and 100),
  add column if not exists qualification_status public.qualification_status not null default 'NEW',
  add column if not exists offer_candidate text,
  add column if not exists qualification_reasons jsonb not null default '[]'::jsonb,
  add column if not exists qualification_algorithm_version text,
  add column if not exists qualified_at timestamptz;

create index if not exists leads_workspace_discovery_score_idx
  on public.leads (workspace_id, discovery_score desc nulls last);
create index if not exists leads_workspace_qualification_status_idx
  on public.leads (workspace_id, qualification_status);
create index if not exists leads_workspace_offer_candidate_idx
  on public.leads (workspace_id, offer_candidate)
  where offer_candidate is not null;

create table if not exists public.cost_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  operation text not null,
  entity_type text,
  entity_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid,
  quantity numeric not null default 1,
  estimated_cost_usd numeric(12,6) not null default 0,
  currency text not null default 'USD',
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cost_events_workspace_occurred_idx
  on public.cost_events (workspace_id, occurred_at desc);
create index if not exists cost_events_provider_operation_idx
  on public.cost_events (workspace_id, provider, operation, occurred_at desc);
create index if not exists cost_events_lead_idx
  on public.cost_events (lead_id, occurred_at desc);

alter table public.cost_events enable row level security;
alter table public.cost_events force row level security;

drop policy if exists cost_events_select on public.cost_events;
create policy cost_events_select on public.cost_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
