-- ============================================================================
-- 0012_template_engine_phase_c.sql
-- Phase C: riusa website_templates / website_template_versions / demo_sites
-- (Master Template + Demo Instance). Nessuna tabella duplicata.
-- - vertical sul catalogo template
-- - published_at sulle versioni
-- - lead_sources esteso con FACEBOOK (riservato, non implementato)
-- - seed Restaurant Premium per ogni workspace
-- ============================================================================

alter table public.website_templates
  add column if not exists vertical text;

update public.website_templates
   set vertical = coalesce(vertical, category)
 where vertical is null;

alter table public.website_template_versions
  add column if not exists published_at timestamptz;

update public.website_template_versions
   set published_at = created_at
 where is_published = true
   and published_at is null;

alter table public.lead_sources drop constraint if exists lead_sources_source_type_check;
alter table public.lead_sources
  add constraint lead_sources_source_type_check
  check (source_type in (
    'GOOGLE_PLACES_DISCOVERY',
    'GOOGLE_PLACES_ENRICHMENT',
    'WEBSITE_ANALYSIS',
    'MANUAL',
    'IMPORT',
    'FACEBOOK'
  ));

-- Restaurant Premium: metadata only. Il renderer vive in codice (layout_key).
insert into public.website_templates (
  workspace_id, key, name, description, category, vertical, status
)
select
  w.id,
  'restaurant-premium',
  'Restaurant Premium',
  'Master template tecnico per attività food/ristorazione. Design commerciale definitivo in uno slice successivo.',
  'restaurant',
  'restaurant',
  'ACTIVE'
from public.workspaces w
on conflict (workspace_id, key) do update
  set name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      vertical = excluded.vertical,
      status = 'ACTIVE',
      updated_at = now();

insert into public.website_template_versions (
  workspace_id,
  template_id,
  version,
  layout_key,
  component_version,
  schema,
  default_content,
  is_published,
  published_at
)
select
  t.workspace_id,
  t.id,
  1,
  'restaurant-premium',
  '1.0.0',
  '{
    "renderer_key": "restaurant-premium",
    "fields": [
      {"key":"business_name","group":"branding","type":"text","label":"Nome attività"},
      {"key":"logo_url","group":"branding","type":"url","label":"Logo URL"},
      {"key":"primary_color","group":"branding","type":"color","label":"Colore primario"},
      {"key":"accent_color","group":"branding","type":"color","label":"Colore accent"},
      {"key":"images","group":"branding","type":"url_list","label":"Immagini"},
      {"key":"headline","group":"content","type":"text","label":"Headline"},
      {"key":"description","group":"content","type":"textarea","label":"Descrizione"},
      {"key":"cta","group":"content","type":"text","label":"CTA"},
      {"key":"phone","group":"contact","type":"text","label":"Telefono"},
      {"key":"address","group":"contact","type":"text","label":"Indirizzo"},
      {"key":"email","group":"contact","type":"text","label":"Email"},
      {"key":"city","group":"contact","type":"text","label":"Città"}
    ]
  }'::jsonb,
  '{
    "branding": {
      "business_name": null,
      "logo_url": null,
      "primary_color": "#1c1917",
      "accent_color": "#d97706",
      "images": []
    },
    "content": {
      "headline": null,
      "description": null,
      "cta": "Prenota un tavolo"
    },
    "contact": {
      "phone": null,
      "address": null,
      "email": null,
      "city": null
    }
  }'::jsonb,
  true,
  now()
from public.website_templates t
where t.key = 'restaurant-premium'
  and not exists (
    select 1
    from public.website_template_versions v
    where v.template_id = t.id
      and v.version = 1
  );
