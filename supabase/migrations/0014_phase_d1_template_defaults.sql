-- ============================================================================
-- 0014_phase_d1_template_defaults.sql
-- Phase D.1: new immutable Restaurant Premium V2 version with concept copy,
-- plus bootstrap admin workspace membership.
-- Cannot UPDATE published website_template_versions (§9).
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
  'restaurant-premium-v2',
  '2.1.0',
  (
    select v.schema
    from public.website_template_versions v
    where v.template_id = t.id and v.layout_key = 'restaurant-premium-v2'
    order by v.version desc
    limit 1
  ),
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
      "headline": "Un luogo da raccontare online",
      "subheadline": "Concept dimostrativo di presenza digitale: elegante, chiara e pensata per far conoscere la tua attività.",
      "description": "Questa è un’anteprima di come potrebbe apparire una vetrina digitale curata: presentazione, atmosfera e contatti in un’unica pagina, senza sostituire le informazioni reali del tuo locale.",
      "about": "Il layout è un concept dimostrativo. I dati anagrafici (nome, indirizzo, rating Google) restano quelli forniti; il resto è struttura e stile del template.",
      "highlights": [
        "Presentazione chiara e professionale",
        "Focus su fiducia e recensioni Google",
        "Invito all’azione per contatto o prenotazione"
      ],
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
    select 1
    from public.website_template_versions v
    where v.template_id = t.id
      and v.layout_key = 'restaurant-premium-v2'
      and v.component_version = '2.1.0'
  );

-- Bootstrap admin membership for internal tool owner (Supabase Auth user)
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'OWNER'
from public.workspaces w
cross join auth.users u
where w.slug = 'sales-os'
  and lower(u.email) = 'attiliomazzetti@gmail.com'
on conflict (workspace_id, user_id) do update set role = excluded.role;
