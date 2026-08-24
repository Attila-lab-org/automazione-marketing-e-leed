-- ============================================================================
-- 0015_restaurant_premium_v3.sql
-- Restaurant Premium V3 renderer (immutable insert; V1/V2 untouched).
-- ============================================================================

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
  'restaurant-premium-v3',
  '3.0.0',
  '{
    "renderer_key": "restaurant-premium-v3",
    "fields": [
      {"key":"business_name","group":"branding","type":"text","label":"Nome attività"},
      {"key":"logo_url","group":"branding","type":"url","label":"Logo URL"},
      {"key":"primary_color","group":"branding","type":"color","label":"Colore primario"},
      {"key":"accent_color","group":"branding","type":"color","label":"Colore accent"},
      {"key":"hero_image","group":"branding","type":"url","label":"Hero image URL"},
      {"key":"gallery","group":"branding","type":"url_list","label":"Gallery"},
      {"key":"headline","group":"content","type":"text","label":"Headline"},
      {"key":"subheadline","group":"content","type":"textarea","label":"Subheadline"},
      {"key":"description","group":"content","type":"textarea","label":"Descrizione"},
      {"key":"cta","group":"content","type":"text","label":"CTA label"},
      {"key":"cta_url","group":"content","type":"url","label":"CTA URL"},
      {"key":"owner_cta_label","group":"content","type":"text","label":"Owner CTA label"},
      {"key":"owner_cta_url","group":"content","type":"url","label":"Owner CTA URL"},
      {"key":"phone","group":"contact","type":"text","label":"Telefono"},
      {"key":"address","group":"contact","type":"text","label":"Indirizzo"},
      {"key":"city","group":"contact","type":"text","label":"Città"},
      {"key":"opening_hours","group":"contact","type":"textarea","label":"Orari"},
      {"key":"rating","group":"signals","type":"number","label":"Rating Google","readOnly":true},
      {"key":"review_count","group":"signals","type":"number","label":"Recensioni Google","readOnly":true}
    ]
  }'::jsonb,
  '{
    "branding": {
      "business_name": null,
      "logo_url": null,
      "primary_color": "#2c241e",
      "accent_color": "#b86a45",
      "hero_image": "/restaurant-premium-v3/assets/hero.jpg",
      "gallery": [
        "/restaurant-premium-v3/assets/gallery-1.jpg",
        "/restaurant-premium-v3/assets/gallery-2.jpg",
        "/restaurant-premium-v3/assets/gallery-3.jpg",
        "/restaurant-premium-v3/assets/food-detail.jpg",
        "/restaurant-premium-v3/assets/table.jpg"
      ]
    },
    "content": {
      "headline": "Un’esperienza che inizia prima ancora di sedersi a tavola.",
      "subheadline": "Una presenza digitale raffinata, pensata per raccontare atmosfera, accoglienza e il desiderio di riservare un tavolo.",
      "description": "Ogni dettaglio della pagina è pensato per evocare ospitalità contemporanea: luce, ritmo, silenzio e un invito chiaro a vivere il locale.",
      "about": "Concept dimostrativo di vetrina digitale. I dati anagrafici del locale restano quelli reali; immagini e testi di atmosfera appartengono al template.",
      "highlights": ["Atmosfera", "Esperienza", "Prenotazione semplice"],
      "cta": "Prenota un tavolo",
      "cta_url": null,
      "owner_cta_label": "Parliamone",
      "owner_cta_url": null
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
    select 1
    from public.website_template_versions v
    where v.template_id = t.id
      and v.layout_key = 'restaurant-premium-v3'
  );
