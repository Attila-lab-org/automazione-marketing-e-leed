-- ============================================================================
-- 0003_audits_scores_segments.sql
-- Contenuto (§16.3): website_audits, lead_scores, tags, lead_tags, segments.
-- Riferimenti: MASTER_SPEC §5.1-5.3, §14.1; DATABASE_MIGRATION_PLAN §6.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabella website_audits (result contract §14.1, audit versionato)
-- ----------------------------------------------------------------------------
create table if not exists public.website_audits (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  audit_version   integer not null,
  final_url       text,
  redirect_chain  jsonb not null default '[]',
  emails_found    jsonb not null default '[]',   -- contatti pubblici trovati
  phones_found    jsonb not null default '[]',
  social_links    jsonb not null default '[]',
  ctas            jsonb not null default '[]',   -- CTA principali
  key_pages       jsonb not null default '[]',   -- pagine chiave trovate
  mobile_signals  jsonb not null default '{}',   -- segnali responsive/mobile
  issues          jsonb not null default '[]',   -- {type, severity, evidence, confidence} §14.1
  opportunities   jsonb not null default '[]',
  evidence_assets jsonb not null default '[]',   -- riferimenti a screenshot/evidenze
  raw_result      jsonb,                         -- output normalizzato completo del Browser Worker
  analyzed_by     text,                          -- provider adapter usato (mai hardcoded §1)
  created_at      timestamptz not null default now(),
  unique (lead_id, audit_version)
);

create index if not exists website_audits_lead_version_idx on public.website_audits (lead_id, audit_version desc);
create index if not exists website_audits_workspace_idx on public.website_audits (workspace_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Tabella lead_scores (§5.1: score spiegabile e versionato)
-- breakdown e reasons NOT NULL: mai un numero unico senza evidenze (§5.1)
-- ----------------------------------------------------------------------------
create table if not exists public.lead_scores (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  lead_id                  uuid not null references public.leads(id) on delete cascade,
  algorithm_version        text not null,        -- obbligatorio §5.1
  opportunity_score        integer check (opportunity_score between 0 and 100),
  contactability_score     integer check (contactability_score between 0 and 100),
  data_confidence_score    integer check (data_confidence_score between 0 and 100),
  template_match_score     integer check (template_match_score between 0 and 100),
  business_potential_score integer check (business_potential_score between 0 and 100),
  total_score              integer check (total_score between 0 and 100),
  confidence               integer check (confidence between 0 and 100),
  breakdown                jsonb not null default '{}', -- dettaglio per dimensione con evidenze
  reasons                  jsonb not null default '[]', -- motivazioni sintetiche §5.1
  is_current               boolean not null default true,
  created_at               timestamptz not null default now()
);

-- Un solo score corrente per lead
create unique index if not exists lead_scores_current_key
  on public.lead_scores (lead_id) where is_current;

create index if not exists lead_scores_lead_idx on public.lead_scores (lead_id, created_at desc);
create index if not exists lead_scores_workspace_idx on public.lead_scores (workspace_id, total_score desc);

-- Trigger BEFORE INSERT: se il nuovo record è is_current=true, demota gli altri
-- e aggiorna i campi denormalizzati leads.current_score/current_confidence.
-- SECURITY DEFINER: l'update denormalizzato su leads è un effetto collaterale
-- interno coerente (il chiamante ha già INSERT su lead_scores per il workspace);
-- evita fallimenti RLS se il ruolo ha write su lead_scores ma non su leads.
create or replace function public.lead_scores_set_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_current then
    update public.lead_scores
    set is_current = false
    where lead_id = new.lead_id and is_current;

    update public.leads
    set current_score      = new.total_score,
        current_confidence = new.confidence
    where id = new.lead_id;
  end if;
  return new;
end $$;

drop trigger if exists lead_scores_set_current on public.lead_scores;
create trigger lead_scores_set_current
  before insert on public.lead_scores
  for each row execute function public.lead_scores_set_current();

-- ----------------------------------------------------------------------------
-- Tabelle tags e lead_tags (§5.3 tag custom)
-- ----------------------------------------------------------------------------
create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  color        text,
  created_at   timestamptz not null default now()
);

create unique index if not exists tags_workspace_name_key on public.tags (workspace_id, lower(name));

create table if not exists public.lead_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  tag_id       uuid not null references public.tags(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

create index if not exists lead_tags_workspace_idx on public.lead_tags (workspace_id, tag_id);

-- ----------------------------------------------------------------------------
-- Tabella segments (saved filter definitions §5.3)
-- filters jsonb: categoria, regione/provincia/città/raggio, score range,
-- confidence min, sito sì/no, audit sì/no, email sì/no, template match min,
-- rating/review, business/processing status, campagna assegnata sì/no, tag.
-- ----------------------------------------------------------------------------
create table if not exists public.segments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  filters      jsonb not null,
  is_archived  boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists segments_workspace_name_key on public.segments (workspace_id, lower(name));

drop trigger if exists segments_set_updated_at on public.segments;
create trigger segments_set_updated_at
  before update on public.segments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS 0003 — pattern standard §5.4 piano
-- ----------------------------------------------------------------------------
alter table public.website_audits enable row level security;
alter table public.website_audits force row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_scores force row level security;
alter table public.tags enable row level security;
alter table public.tags force row level security;
alter table public.lead_tags enable row level security;
alter table public.lead_tags force row level security;
alter table public.segments enable row level security;
alter table public.segments force row level security;

-- website_audits
drop policy if exists website_audits_select on public.website_audits;
create policy website_audits_select on public.website_audits for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists website_audits_insert on public.website_audits;
create policy website_audits_insert on public.website_audits for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_audits_update on public.website_audits;
create policy website_audits_update on public.website_audits for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_audits_delete on public.website_audits;
create policy website_audits_delete on public.website_audits for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- lead_scores
drop policy if exists lead_scores_select on public.lead_scores;
create policy lead_scores_select on public.lead_scores for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists lead_scores_insert on public.lead_scores;
create policy lead_scores_insert on public.lead_scores for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_scores_update on public.lead_scores;
create policy lead_scores_update on public.lead_scores for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_scores_delete on public.lead_scores;
create policy lead_scores_delete on public.lead_scores for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- tags
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists tags_update on public.tags;
create policy tags_update on public.tags for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists tags_delete on public.tags;
create policy tags_delete on public.tags for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- lead_tags
drop policy if exists lead_tags_select on public.lead_tags;
create policy lead_tags_select on public.lead_tags for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists lead_tags_insert on public.lead_tags;
create policy lead_tags_insert on public.lead_tags for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_tags_update on public.lead_tags;
create policy lead_tags_update on public.lead_tags for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_tags_delete on public.lead_tags;
create policy lead_tags_delete on public.lead_tags for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- segments
drop policy if exists segments_select on public.segments;
create policy segments_select on public.segments for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists segments_insert on public.segments;
create policy segments_insert on public.segments for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists segments_update on public.segments;
create policy segments_update on public.segments for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists segments_delete on public.segments;
create policy segments_delete on public.segments for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
