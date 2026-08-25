-- ============================================================================
-- 0022_ai_runs.sql
-- AI-0 foundation: persistenza run OpenAI (modello, token, costo, latenza).
-- Additive. Non modifica campagne, messaggi, Telegram o Google.
-- Rollback: drop table public.ai_runs;
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ai_run_status') then
    create type public.ai_run_status as enum (
      'ok', 'error', 'timeout', 'invalid_output'
    );
  end if;
end $$;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  model text not null,
  task_type text not null,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  thread_id uuid references public.message_threads(id) on delete set null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  status public.ai_run_status not null,
  error_message text,
  request_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_runs_workspace_created_idx
  on public.ai_runs (workspace_id, created_at desc);

create index if not exists ai_runs_workspace_task_idx
  on public.ai_runs (workspace_id, task_type, created_at desc);

create index if not exists ai_runs_lead_idx
  on public.ai_runs (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists ai_runs_status_idx
  on public.ai_runs (workspace_id, status, created_at desc);

alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs for select to authenticated
  using (public.is_workspace_member(workspace_id));
