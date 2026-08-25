-- ============================================================================
-- 0023_ai_operator_sessions.sql
-- AI-1: sessioni copilot operatore. Separate dalle conversazioni prospect.
-- Additive. Rollback: drop table public.ai_operator_messages;
--                drop table public.ai_operator_sessions;
-- ============================================================================

create table if not exists public.ai_operator_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default 'Attila AI',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_operator_sessions_workspace_updated_idx
  on public.ai_operator_sessions (workspace_id, updated_at desc);

create table if not exists public.ai_operator_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.ai_operator_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  actions jsonb not null default '[]'::jsonb,
  tool_trace jsonb not null default '[]'::jsonb,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_operator_messages_session_created_idx
  on public.ai_operator_messages (session_id, created_at asc);

alter table public.ai_operator_sessions enable row level security;
alter table public.ai_operator_sessions force row level security;
alter table public.ai_operator_messages enable row level security;
alter table public.ai_operator_messages force row level security;

drop policy if exists ai_operator_sessions_select on public.ai_operator_sessions;
create policy ai_operator_sessions_select on public.ai_operator_sessions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists ai_operator_messages_select on public.ai_operator_messages;
create policy ai_operator_messages_select on public.ai_operator_messages
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
