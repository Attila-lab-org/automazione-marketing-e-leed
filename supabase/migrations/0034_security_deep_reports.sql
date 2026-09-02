-- ============================================================================
-- 0034_security_deep_reports.sql
-- Secondo report tecnico, eseguito solo dopo consenso registrato.
-- ============================================================================

alter table public.security_targets drop constraint if exists security_targets_status_check;
alter table public.security_targets
  add constraint security_targets_status_check
  check (status in (
    'listed',
    'audited',
    'skipped',
    'email_draft',
    'email_sent',
    'failed',
    'deep_open',
    'deep_running',
    'deep_done',
    'deep_failed'
  ));

alter table public.security_targets
  add column if not exists latest_deep_audit_id uuid;

create table if not exists public.security_deep_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid not null references public.security_targets(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  baseline_audit_id uuid references public.security_audits(id) on delete set null,
  requested_url text not null,
  final_url text,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  score integer check (score is null or (score between 0 and 100)),
  pages_scanned jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists security_deep_audits_target_idx
  on public.security_deep_audits (target_id, started_at desc);

alter table public.security_deep_audits enable row level security;
alter table public.security_deep_audits force row level security;

drop policy if exists security_deep_audits_select on public.security_deep_audits;
create policy security_deep_audits_select
  on public.security_deep_audits for select to authenticated
  using (public.is_workspace_member(workspace_id));
