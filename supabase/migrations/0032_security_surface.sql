-- ============================================================================
-- 0032_security_surface.sql
-- Check-up visibile da fuori: una GET alla pagina pubblica, fatti con prova.
-- Nessun percorso nascosto, nessun payload, nessun form.
-- ============================================================================

create table if not exists public.security_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  url text not null,
  domain text not null,
  name text not null,
  status text not null default 'listed'
    check (status in ('listed','audited','skipped','email_draft','email_sent','failed')),
  score integer check (score is null or (score between 0 and 100)),
  latest_audit_id uuid,
  public_slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, lead_id)
);

create index if not exists security_targets_workspace_idx
  on public.security_targets (workspace_id, updated_at desc);
create index if not exists security_targets_status_idx
  on public.security_targets (workspace_id, status);

create table if not exists public.security_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid not null references public.security_targets(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  requested_url text not null,
  final_url text,
  http_status integer,
  score integer not null check (score between 0 and 100),
  headers jsonb not null default '{}'::jsonb,
  technologies jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  emails_found jsonb not null default '[]'::jsonb,
  api_mentions jsonb not null default '[]'::jsonb,
  ga_ids jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists security_audits_target_idx
  on public.security_audits (target_id, created_at desc);

-- latest_audit_id è un riferimento morbido: niente FK verso security_audits
-- per evitare un ciclo in cancellazione (target ↔ audit).

create table if not exists public.security_outreach (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid not null references public.security_targets(id) on delete cascade,
  audit_id uuid references public.security_audits(id) on delete set null,
  to_email text,
  subject text not null,
  body_html text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','mock_sent','failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists security_outreach_target_idx
  on public.security_outreach (target_id, created_at desc);

alter table public.security_targets enable row level security;
alter table public.security_audits enable row level security;
alter table public.security_outreach enable row level security;
alter table public.security_targets force row level security;
alter table public.security_audits force row level security;
alter table public.security_outreach force row level security;

drop policy if exists security_targets_select on public.security_targets;
create policy security_targets_select on public.security_targets for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists security_audits_select on public.security_audits;
create policy security_audits_select on public.security_audits for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists security_outreach_select on public.security_outreach;
create policy security_outreach_select on public.security_outreach for select to authenticated
  using (public.is_workspace_member(workspace_id));
