-- ============================================================================
-- 0013_commercial_core_phase_d.sql
-- Phase D: Restaurant Premium V2 version, default sequence/message seeds,
-- campaign_leads prep metadata, fixture cleanup markers.
-- ============================================================================

-- Restaurant Premium V2 renderer (V1 remains published & frozen)
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
  coalesce((select max(v.version) from public.website_template_versions v where v.template_id = t.id), 0) + 1,
  'restaurant-premium-v2',
  '2.0.0',
  '{
    "renderer_key": "restaurant-premium-v2",
    "fields": [
      {"key":"business_name","group":"branding","type":"text","label":"Nome attività"},
      {"key":"logo_url","group":"branding","type":"url","label":"Logo URL"},
      {"key":"primary_color","group":"branding","type":"color","label":"Colore primario"},
      {"key":"accent_color","group":"branding","type":"color","label":"Colore accent"},
      {"key":"hero_image","group":"branding","type":"url","label":"Hero image URL"},
      {"key":"gallery","group":"branding","type":"url_list","label":"Gallery"},
      {"key":"headline","group":"content","type":"text","label":"Headline"},
      {"key":"subheadline","group":"content","type":"text","label":"Subheadline"},
      {"key":"description","group":"content","type":"textarea","label":"Descrizione"},
      {"key":"about","group":"content","type":"textarea","label":"About"},
      {"key":"highlights","group":"content","type":"text_list","label":"Punti di forza"},
      {"key":"cta","group":"content","type":"text","label":"CTA"},
      {"key":"phone","group":"contact","type":"text","label":"Telefono"},
      {"key":"address","group":"contact","type":"text","label":"Indirizzo"},
      {"key":"email","group":"contact","type":"text","label":"Email"},
      {"key":"city","group":"contact","type":"text","label":"Città"},
      {"key":"opening_hours","group":"contact","type":"textarea","label":"Orari"},
      {"key":"rating","group":"signals","type":"number","label":"Rating Google"},
      {"key":"review_count","group":"signals","type":"number","label":"Recensioni Google"}
    ]
  }'::jsonb,
  '{
    "branding": {
      "business_name": null,
      "logo_url": null,
      "primary_color": "#1c1917",
      "accent_color": "#d97706",
      "hero_image": null,
      "gallery": []
    },
    "content": {
      "headline": null,
      "subheadline": null,
      "description": null,
      "about": null,
      "highlights": [],
      "cta": "Prenota un tavolo"
    },
    "contact": {
      "phone": null,
      "address": null,
      "email": null,
      "city": null,
      "opening_hours": null
    },
    "signals": {
      "rating": null,
      "review_count": null
    }
  }'::jsonb,
  true,
  now()
from public.website_templates t
where t.key = 'restaurant-premium'
  and not exists (
    select 1 from public.website_template_versions v
    where v.template_id = t.id and v.layout_key = 'restaurant-premium-v2'
  );

-- Default visual email message template (metadata only — body in code constants)
insert into public.message_templates (workspace_id, key, name, category, status)
select w.id, 'visual-intro-v1', 'Intro commerciale con preview', 'general', 'ACTIVE'
from public.workspaces w
on conflict (workspace_id, key) do nothing;

insert into public.message_template_versions (workspace_id, template_id, version, subject, body, variables)
select
  mt.workspace_id,
  mt.id,
  1,
  '{{business_name}} — abbiamo preparato un''anteprima per te',
  'Buongiorno,

abbiamo preparato un''anteprima personalizzata per {{business_name}}.

{{preview_image_block}}

{{cta_block}}

Anteprima / concept dimostrativo.

Cordiali saluti,
{{sender_name}}',
  '["business_name","preview_image_url","demo_url","cta_block","preview_image_block","sender_name"]'::jsonb
from public.message_templates mt
where mt.key = 'visual-intro-v1'
  and not exists (
    select 1 from public.message_template_versions v where v.template_id = mt.id and v.version = 1
  );

-- Default 3-step follow-up sequence
insert into public.followup_sequences (workspace_id, name, description, status)
select w.id, 'Standard 0-3-7', 'Email iniziale + follow-up a 3 e 7 giorni', 'ACTIVE'
from public.workspaces w
on conflict (workspace_id, name) do nothing;

insert into public.followup_sequence_versions (workspace_id, sequence_id, version, steps)
select
  fs.workspace_id,
  fs.id,
  1,
  jsonb_build_array(
    jsonb_build_object('step', 0, 'delay_days', 0, 'label', 'Email iniziale con preview'),
    jsonb_build_object('step', 1, 'delay_days', 3, 'label', 'Follow-up breve'),
    jsonb_build_object('step', 2, 'delay_days', 7, 'label', 'Ultimo follow-up')
  )
from public.followup_sequences fs
where fs.name = 'Standard 0-3-7'
  and not exists (
    select 1 from public.followup_sequence_versions v where v.sequence_id = fs.id and v.version = 1
  );

-- Campaign lead preparation metadata (email enrichment status etc.)
alter table public.campaign_leads
  add column if not exists preparation jsonb not null default '{}'::jsonb;

-- Safe fixture cleanup (inequivocable markers only)
delete from public.leads
where google_place_id like 'mock-place-%'
   or google_place_id like 'seed-place-%'
   or website_url ilike '%.example.com'
   or normalized_email ilike '%@example.com';
