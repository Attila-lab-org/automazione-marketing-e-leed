-- ============================================================================
-- 0002_leads_sources_contacts.sql
-- Contenuto (§16.3): leads, lead_contacts, lead_sources, indici dedupe §13.2.
-- Riferimenti: MASTER_SPEC §13.1-13.2, §16.2; DATABASE_MIGRATION_PLAN §5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabella leads (colonne core §16.2)
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  google_place_id        text,                                   -- identificatore forte §13.1
  name                   text not null,
  category               text,
  subcategory            text,
  address                text,
  city                   text,
  region                 text,
  postal_code            text,
  country                text,
  lat                    numeric(9,6),
  lng                    numeric(9,6),
  website_url            text,
  normalized_domain      text,                                   -- lowercase, no www.
  phone                  text,                                   -- convenience field (copia contatto primario §16.2)
  email                  text,                                   -- convenience field
  normalized_phone       text,                                   -- solo cifre (E.164 senza '+')
  normalized_email       text,                                   -- lowercase trim
  business_status        public.business_status not null default 'NEW',    -- §3.1
  processing_status      public.processing_status not null default 'IDLE', -- §3.1
  current_score          integer check (current_score between 0 and 100),
  current_confidence     integer check (current_confidence between 0 and 100),
  rating                 numeric(2,1),                           -- segnale business potential §5.1
  review_count           integer,
  google_last_enriched_at timestamptz,                           -- §13.1
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Vincolo dedupe primario (§16.2, §13.2 segnale 1): unique parziale —
-- ammette più lead con google_place_id NULL (inserimenti manuali), ma un solo
-- lead per Place ID dentro il workspace.
create unique index if not exists leads_workspace_place_key
  on public.leads (workspace_id, google_place_id)
  where google_place_id is not null;

-- Indici dedupe §13.2 (segnali 2-4)
create index if not exists leads_dedupe_domain_idx on public.leads (workspace_id, normalized_domain)
  where normalized_domain is not null;
create index if not exists leads_dedupe_phone_idx on public.leads (workspace_id, normalized_phone)
  where normalized_phone is not null;
create index if not exists leads_dedupe_email_idx on public.leads (workspace_id, normalized_email)
  where normalized_email is not null;

-- Fuzzy name match: SOLO segnale informativo (§13.2 punto 5), mai merge automatico
create index if not exists leads_name_trgm_idx on public.leads using gin (lower(name) gin_trgm_ops);

-- Indici operativi (segmentazione §5.3, lead list §7.1)
create index if not exists leads_workspace_category_idx on public.leads (workspace_id, category, subcategory);
create index if not exists leads_workspace_score_idx    on public.leads (workspace_id, current_score desc);
create index if not exists leads_workspace_bstatus_idx  on public.leads (workspace_id, business_status);
create index if not exists leads_workspace_pstatus_idx  on public.leads (workspace_id, processing_status);
create index if not exists leads_workspace_geo_idx      on public.leads (workspace_id, region, city);

-- ----------------------------------------------------------------------------
-- Tabella lead_contacts (§5.2 piano)
-- ----------------------------------------------------------------------------
create table if not exists public.lead_contacts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  type             text not null check (type in ('EMAIL','PHONE','PERSON','OTHER')),
  value            text not null,               -- valore originale
  normalized_value text,                        -- chiave di dedupe cross-contact
  label            text,                        -- es. "info", "ufficio"
  is_primary       boolean not null default false, -- alimenta i convenience fields di leads
  source           text,                        -- es. GOOGLE_PLACES, WEBSITE_ANALYSIS, MANUAL
  created_at       timestamptz not null default now()
);

create index if not exists lead_contacts_lead_idx on public.lead_contacts (lead_id);
create index if not exists lead_contacts_dedupe_idx on public.lead_contacts (workspace_id, normalized_value)
  where normalized_value is not null;

-- ----------------------------------------------------------------------------
-- Tabella lead_sources (provenance §13, Decision Trace §19.1)
-- ----------------------------------------------------------------------------
create table if not exists public.lead_sources (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  source_type    text not null check (source_type in (
                   'GOOGLE_PLACES_DISCOVERY','GOOGLE_PLACES_ENRICHMENT',
                   'WEBSITE_ANALYSIS','MANUAL','IMPORT')),
  external_id    text,                          -- es. google_place_id alla scoperta
  query_snapshot jsonb not null default '{}',   -- categoria/area/raggio/filtri §13.1
  created_at     timestamptz not null default now()
);

create index if not exists lead_sources_lead_idx on public.lead_sources (lead_id);
create index if not exists lead_sources_workspace_type_idx on public.lead_sources (workspace_id, source_type);

-- ----------------------------------------------------------------------------
-- RLS 0002 — pattern standard §5.4 piano:
--   SELECT: tutti i membri | INSERT/UPDATE: Owner/Admin/Operator
--   DELETE: Owner/Admin    | Viewer: read-only
-- ----------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.leads force row level security;
alter table public.lead_contacts enable row level security;
alter table public.lead_contacts force row level security;
alter table public.lead_sources enable row level security;
alter table public.lead_sources force row level security;

-- leads
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- lead_contacts
drop policy if exists lead_contacts_select on public.lead_contacts;
create policy lead_contacts_select on public.lead_contacts for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists lead_contacts_insert on public.lead_contacts;
create policy lead_contacts_insert on public.lead_contacts for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_contacts_update on public.lead_contacts;
create policy lead_contacts_update on public.lead_contacts for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_contacts_delete on public.lead_contacts;
create policy lead_contacts_delete on public.lead_contacts for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- lead_sources
drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists lead_sources_insert on public.lead_sources;
create policy lead_sources_insert on public.lead_sources for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_sources_update on public.lead_sources;
create policy lead_sources_update on public.lead_sources for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists lead_sources_delete on public.lead_sources;
create policy lead_sources_delete on public.lead_sources for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
