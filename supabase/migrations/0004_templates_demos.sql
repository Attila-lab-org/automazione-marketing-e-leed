-- ============================================================================
-- 0004_templates_demos.sql
-- Contenuto (§16.3): website_templates(+versions), demo_sites, demo_versions,
-- demo_assets. Modello §9: master versionato + istanza configurativa.
-- Riferimenti: MASTER_SPEC §9, §10, §18 (demo privacy); DATABASE_MIGRATION_PLAN §7.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum (§7.1 piano)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'demo_status') then
    create type public.demo_status as enum ('DRAFT', 'PUBLISHED', 'DISABLED', 'EXPIRED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type public.asset_kind as enum
      ('LOGO','HERO','GALLERY','SCREENSHOT_DESKTOP','SCREENSHOT_MOBILE','OTHER');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella website_templates (identità logica §9)
-- I template seed vengono materializzati per workspace (0010) → RLS uniforme.
-- ----------------------------------------------------------------------------
create table if not exists public.website_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null,                 -- identità logica stabile
  name         text,
  description  text,
  category     text,                          -- categoria target per template match §5.1
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, key)
);

drop trigger if exists website_templates_set_updated_at on public.website_templates;
create trigger website_templates_set_updated_at
  before update on public.website_templates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella website_template_versions (snapshot §9)
-- schema jsonb: campi configurabili §9.1 (business_name, logo, palette, hero,
-- about, services, highlights, gallery, contatti, social, CTA, visibility toggle)
-- ----------------------------------------------------------------------------
create table if not exists public.website_template_versions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  template_id       uuid not null references public.website_templates(id) on delete cascade,
  version           integer not null,
  layout_key        text not null,
  component_version text not null,
  schema            jsonb not null,
  default_content   jsonb not null default '{}',
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (template_id, version)
);

-- Versioni immutabili dopo publish (§9): trigger condizionale (funzione creata in 0001)
drop trigger if exists website_template_versions_immutable on public.website_template_versions;
create trigger website_template_versions_immutable
  before update or delete on public.website_template_versions
  for each row execute function public.forbid_mutation_if_published();

create index if not exists website_template_versions_ws_idx
  on public.website_template_versions (workspace_id, template_id);

-- ----------------------------------------------------------------------------
-- Tabella demo_sites (istanza collegata al lead §9, §10)
-- ----------------------------------------------------------------------------
create table if not exists public.demo_sites (
  id                   uuid primary key default gen_random_uuid(), -- ID interno separato dallo slug §10
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  lead_id              uuid not null references public.leads(id) on delete cascade,
  template_id          uuid not null references public.website_templates(id),
  template_version_id  uuid not null references public.website_template_versions(id),
  slug                 text not null,                -- leggibile
  short_id             text not null unique,         -- non sequenziale (anti-enumerazione §10, §18)
  public_url           text,                         -- https://demo.<dominio>/d/<slug>-<short-id>
  status               public.demo_status not null default 'DRAFT', -- disattivabile/scadibile §10
  current_version_id   uuid,                         -- FK aggiunta dopo demo_versions (dipendenza circolare)
  noindex              boolean not null default true, -- noindex,nofollow per demo prospect §10
  published_at         timestamptz,
  disabled_at          timestamptz,
  expires_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists demo_sites_lead_idx on public.demo_sites (lead_id);
create index if not exists demo_sites_workspace_status_idx on public.demo_sites (workspace_id, status);

drop trigger if exists demo_sites_set_updated_at on public.demo_sites;
create trigger demo_sites_set_updated_at
  before update on public.demo_sites
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabella demo_versions (snapshot dati per revisione/pubblicazione §9)
-- "Restore Previous Version" crea una NUOVA versione copiando i dati (§9.2):
-- mai update distruttivo.
-- ----------------------------------------------------------------------------
create table if not exists public.demo_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  demo_site_id uuid not null references public.demo_sites(id) on delete cascade,
  version      integer not null,
  data         jsonb not null,               -- snapshot completo dei campi §9.1
  is_published boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (demo_site_id, version)
);

-- Versioni pubblicate immutabili (trigger condizionale)
drop trigger if exists demo_versions_immutable on public.demo_versions;
create trigger demo_versions_immutable
  before update or delete on public.demo_versions
  for each row execute function public.forbid_mutation_if_published();

create index if not exists demo_versions_ws_idx on public.demo_versions (workspace_id, demo_site_id);

-- FK circolare demo_sites.current_version_id → demo_versions(id): aggiunta qui
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_sites_current_version_id_fkey'
  ) then
    alter table public.demo_sites
      add constraint demo_sites_current_version_id_fkey
      foreign key (current_version_id) references public.demo_versions(id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabella demo_assets (§9, §10: asset e screenshot in Supabase Storage)
-- ----------------------------------------------------------------------------
create table if not exists public.demo_assets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  demo_site_id   uuid not null references public.demo_sites(id) on delete cascade,
  lead_id        uuid references public.leads(id) on delete set null,
  kind           public.asset_kind not null,
  storage_bucket text not null,              -- puntatore a Supabase Storage
  storage_path   text not null,
  public_url     text,
  provenance     jsonb not null default '{}', -- origine asset registrata §9.2: provider, sorgente, job_id
  created_at     timestamptz not null default now()
);

create index if not exists demo_assets_demo_kind_idx on public.demo_assets (demo_site_id, kind);
create index if not exists demo_assets_workspace_kind_idx on public.demo_assets (workspace_id, kind);

-- ----------------------------------------------------------------------------
-- RLS 0004 — pattern standard §5.4 piano su tutte le tabelle.
-- Nota §7.7 piano: le demo pubbliche sono servite dalle route Next.js con
-- service role server-side (nessuna policy anon); anti-enumerazione garantita
-- da short_id non sequenziale + noindex.
-- ----------------------------------------------------------------------------
alter table public.website_templates enable row level security;
alter table public.website_templates force row level security;
alter table public.website_template_versions enable row level security;
alter table public.website_template_versions force row level security;
alter table public.demo_sites enable row level security;
alter table public.demo_sites force row level security;
alter table public.demo_versions enable row level security;
alter table public.demo_versions force row level security;
alter table public.demo_assets enable row level security;
alter table public.demo_assets force row level security;

-- website_templates
drop policy if exists website_templates_select on public.website_templates;
create policy website_templates_select on public.website_templates for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists website_templates_insert on public.website_templates;
create policy website_templates_insert on public.website_templates for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_templates_update on public.website_templates;
create policy website_templates_update on public.website_templates for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_templates_delete on public.website_templates;
create policy website_templates_delete on public.website_templates for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- website_template_versions
drop policy if exists website_template_versions_select on public.website_template_versions;
create policy website_template_versions_select on public.website_template_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists website_template_versions_insert on public.website_template_versions;
create policy website_template_versions_insert on public.website_template_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_template_versions_update on public.website_template_versions;
create policy website_template_versions_update on public.website_template_versions for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists website_template_versions_delete on public.website_template_versions;
create policy website_template_versions_delete on public.website_template_versions for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- demo_sites
drop policy if exists demo_sites_select on public.demo_sites;
create policy demo_sites_select on public.demo_sites for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists demo_sites_insert on public.demo_sites;
create policy demo_sites_insert on public.demo_sites for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_sites_update on public.demo_sites;
create policy demo_sites_update on public.demo_sites for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_sites_delete on public.demo_sites;
create policy demo_sites_delete on public.demo_sites for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- demo_versions
drop policy if exists demo_versions_select on public.demo_versions;
create policy demo_versions_select on public.demo_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists demo_versions_insert on public.demo_versions;
create policy demo_versions_insert on public.demo_versions for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_versions_update on public.demo_versions;
create policy demo_versions_update on public.demo_versions for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_versions_delete on public.demo_versions;
create policy demo_versions_delete on public.demo_versions for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));

-- demo_assets
drop policy if exists demo_assets_select on public.demo_assets;
create policy demo_assets_select on public.demo_assets for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists demo_assets_insert on public.demo_assets;
create policy demo_assets_insert on public.demo_assets for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_assets_update on public.demo_assets;
create policy demo_assets_update on public.demo_assets for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::public.workspace_role[]));
drop policy if exists demo_assets_delete on public.demo_assets;
create policy demo_assets_delete on public.demo_assets for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::public.workspace_role[]));
