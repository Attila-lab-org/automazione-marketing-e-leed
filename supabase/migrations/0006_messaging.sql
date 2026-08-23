-- ============================================================================
-- 0006_messaging.sql
-- Contenuto (§16.3): message_templates(+versions), message_drafts,
-- message_threads, messages, message_events, suppression_list.
-- Riferimenti: MASTER_SPEC §11 (master versionato / draft / override / sent
-- snapshot immutabile), §11.2 (Send Guard), §12 (inbox/follow-up), §18;
-- DATABASE_MIGRATION_PLAN §9.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§9.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'draft_status') then
    create type public.draft_status as enum ('DRAFT','READY','APPROVED','SENT','CANCELLED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type public.message_direction as enum ('OUTBOUND','INBOUND');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_event_type') then
    create type public.message_event_type as enum
      ('SENT','DELIVERED','OPENED','CLICKED','BOUNCED','COMPLAINED','UNSUBSCRIBED','REPLIED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'suppression_reason') then
    create type public.suppression_reason as enum
      ('HARD_BOUNCE','UNSUBSCRIBE','STOP_REQUEST','MANUAL');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'thread_status') then
    create type public.thread_status as enum ('OPEN','NEEDS_REPLY','ARCHIVED');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- message_templates / message_template_versions (master §11)
-- Il master template NON è alterato dalla personalizzazione del singolo lead.
-- ----------------------------------------------------------------------------
create table if not exists public.message_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null,
  name         text not null,
  category     text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, key)
);

drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

create table if not exists public.message_template_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id  uuid not null references public.message_templates(id) on delete cascade,
  version      integer not null,
  subject      text not null,
  body         text not null,
  variables    jsonb not null default '[]', -- token/variable picker §11.1
  created_at   timestamptz not null default now(),
  unique (template_id, version)
);

-- Versioni master immutabili (§11)
drop trigger if exists message_template_versions_immutable on public.message_template_versions;
create trigger message_template_versions_immutable
  before update or delete on public.message_template_versions
  for each row execute function public.forbid_mutation();

-- FK differite da 0005: campaigns → message template (nota ordine in 0005)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_message_template_id_fkey') then
    alter table public.campaigns
      add constraint campaigns_message_template_id_fkey
      foreign key (message_template_id) references public.message_templates(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_message_template_version_id_fkey') then
    alter table public.campaigns
      add constraint campaigns_message_template_version_id_fkey
      foreign key (message_template_version_id) references public.message_template_versions(id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella message_drafts (bozze personalizzate §11, §9.3 piano)
-- ----------------------------------------------------------------------------
create table if not exists public.message_drafts (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  campaign_lead_id    uuid not null references public.campaign_leads(id) on delete cascade,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  template_version_id uuid not null references public.message_template_versions(id),
  sequence_step       integer not null default 0,
  subject             text not null,
  body                text not null,
  resolved_variables  jsonb not null default '{}', -- variabili già risolte (preview §7.3)
  status              public.draft_status not null default 'DRAFT',
  is_override         boolean not null default false, -- manual override: non aggiorna il master §11
  edited_by           uuid references auth.users(id),
  approved_by         uuid references auth.users(id),  -- Approve & Send §11.1
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Idempotenza Send Guard (§11.2): nessun duplicato per campaign_lead + sequence_step
create unique index if not exists message_drafts_step_key
  on public.message_drafts (campaign_lead_id, sequence_step);

create index if not exists message_drafts_lead_idx on public.message_drafts (lead_id);
create index if not exists message_drafts_workspace_status_idx on public.message_drafts (workspace_id, status);

drop trigger if exists message_drafts_set_updated_at on public.message_drafts;
create trigger message_drafts_set_updated_at
  before update on public.message_drafts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella message_threads (§12.1)
-- ----------------------------------------------------------------------------
create table if not exists public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id) on delete set null,
  subject         text,
  status          public.thread_status not null default 'OPEN',
  unread_count    integer not null default 0,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists message_threads_lead_campaign_key
  on public.message_threads (lead_id, campaign_id) where campaign_id is not null;

create index if not exists message_threads_workspace_idx
  on public.message_threads (workspace_id, status, last_message_at desc);

drop trigger if exists message_threads_set_updated_at on public.message_threads;
create trigger message_threads_set_updated_at
  before update on public.message_threads
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella messages — sent/inbound snapshot IMMUTABILE (§11 "Sent message")
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  thread_id           uuid not null references public.message_threads(id) on delete cascade,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  campaign_lead_id    uuid references public.campaign_leads(id) on delete set null,
  draft_id            uuid references public.message_drafts(id) on delete set null, -- traccia draft → send
  direction           public.message_direction not null,
  provider            text not null default 'resend', -- via adapter, non hardcoded altrove
  provider_message_id text,
  from_address        text not null,
  to_address          text not null,
  subject             text,
  body_snapshot       text not null, -- snapshot immutabile del contenuto realmente inviato/ricevuto
  sequence_step       integer not null default 0,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

-- Idempotenza provider: un solo record per (provider, provider_message_id)
create unique index if not exists messages_provider_message_key
  on public.messages (provider, provider_message_id) where provider_message_id is not null;

create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists messages_lead_idx on public.messages (lead_id, created_at desc);

-- Immutabile (§11): UPDATE/DELETE vietati per TUTTI, service_role incluso
drop trigger if exists messages_immutable on public.messages;
create trigger messages_immutable
  before update or delete on public.messages
  for each row execute function public.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Tabella message_events (delivery/open/click/bounce §16.1, §18 webhook)
-- ----------------------------------------------------------------------------
create table if not exists public.message_events (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  message_id        uuid not null references public.messages(id) on delete cascade,
  event_type        public.message_event_type not null,
  provider_event_id text,                  -- idempotenza webhook §18
  payload           jsonb not null default '{}', -- payload grezzo provider per audit
  occurred_at       timestamptz not null,
  created_at        timestamptz not null default now()
);

-- Idempotenza webhook §18
create unique index if not exists message_events_provider_event_key
  on public.message_events (provider_event_id) where provider_event_id is not null;

create index if not exists message_events_message_idx on public.message_events (message_id, occurred_at);
create index if not exists message_events_workspace_idx
  on public.message_events (workspace_id, event_type, occurred_at);

-- Append-only
drop trigger if exists message_events_immutable on public.message_events;
create trigger message_events_immutable
  before update or delete on public.message_events
  for each row execute function public.forbid_mutation();

-- ----------------------------------------------------------------------------
-- Tabella suppression_list (§12.2, §18)
-- Hard bounce / unsubscribe / stop request bloccano ogni invio successivo
-- (Send Guard check "Recipient" §11.2, verifica server-side ad ogni send).
-- ----------------------------------------------------------------------------
create table if not exists public.suppression_list (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  email             text not null,          -- valore originale
  normalized_email  text not null,          -- lowercase trim
  reason            public.suppression_reason not null,
  source_message_id uuid references public.messages(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create unique index if not exists suppression_workspace_email_key
  on public.suppression_list (workspace_id, normalized_email);

-- ----------------------------------------------------------------------------
-- RLS 0006 — pattern standard §5.4 piano, con eccezioni §9.8:
-- - messages, message_events: nessuna policy UPDATE/DELETE (append-only anche
--   per Owner); scrittura solo via domain layer/service_role.
-- - suppression_list: insert/update Owner/Admin/Operator (stop manuale),
--   delete solo Owner.
-- ----------------------------------------------------------------------------
alter table public.message_templates enable row level security;
alter table public.message_templates force row level security;
alter table public.message_template_versions enable row level security;
alter table public.message_template_versions force row level security;
alter table public.message_drafts enable row level security;
alter table public.message_drafts force row level security;
alter table public.message_threads enable row level security;
alter table public.message_threads force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.message_events enable row level security;
alter table public.message_events force row level security;
alter table public.suppression_list enable row level security;
alter table public.suppression_list force row level security;

-- message_templates
drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists message_templates_insert on public.message_templates;
create policy message_templates_insert on public.message_templates for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_templates_update on public.message_templates;
create policy message_templates_update on public.message_templates for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_templates_delete on public.message_templates;
create policy message_templates_delete on public.message_templates for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- message_template_versions
drop policy if exists message_template_versions_select on public.message_template_versions;
create policy message_template_versions_select on public.message_template_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists message_template_versions_insert on public.message_template_versions;
create policy message_template_versions_insert on public.message_template_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
-- nessuna UPDATE/DELETE: versioni master immutabili (trigger)

-- message_drafts
drop policy if exists message_drafts_select on public.message_drafts;
create policy message_drafts_select on public.message_drafts for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists message_drafts_insert on public.message_drafts;
create policy message_drafts_insert on public.message_drafts for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_drafts_update on public.message_drafts;
create policy message_drafts_update on public.message_drafts for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_drafts_delete on public.message_drafts;
create policy message_drafts_delete on public.message_drafts for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- message_threads
drop policy if exists message_threads_select on public.message_threads;
create policy message_threads_select on public.message_threads for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists message_threads_insert on public.message_threads;
create policy message_threads_insert on public.message_threads for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_threads_update on public.message_threads;
create policy message_threads_update on public.message_threads for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists message_threads_delete on public.message_threads;
create policy message_threads_delete on public.message_threads for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- messages: SOLO SELECT per authenticated (append-only, scrittura service_role)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- message_events: SOLO SELECT per authenticated
drop policy if exists message_events_select on public.message_events;
create policy message_events_select on public.message_events for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- suppression_list
drop policy if exists suppression_list_select on public.suppression_list;
create policy suppression_list_select on public.suppression_list for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists suppression_list_insert on public.suppression_list;
create policy suppression_list_insert on public.suppression_list for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists suppression_list_update on public.suppression_list;
create policy suppression_list_update on public.suppression_list for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists suppression_list_delete on public.suppression_list;
create policy suppression_list_delete on public.suppression_list for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER']::public.workspace_role[]));
