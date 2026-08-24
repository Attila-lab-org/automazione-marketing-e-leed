-- Visual intro email v2: HTML CTA + WhatsApp placeholder, no broken "Anteprima /" line
-- message_template_versions are immutable → insert version 2 and point campaigns at it

insert into public.message_template_versions (workspace_id, template_id, version, subject, body, variables)
select
  mt.workspace_id,
  mt.id,
  2,
  '{{business_name}} — abbiamo preparato un''anteprima per te',
  E'<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#2c241e">Buongiorno,</p>\n<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#2c241e">abbiamo preparato un''anteprima personalizzata per <strong>{{business_name}}</strong>.</p>\n{{preview_image_block}}\n<div style="margin:28px 0 8px">{{cta_block}}</div>\n{{whatsapp_block}}\n<p style="margin:28px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;color:#7a6f65">Concept dimostrativo — non è ancora il sito definitivo.</p>\n<p style="margin:22px 0 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#2c241e">Cordiali saluti,<br/><strong>{{sender_name}}</strong><br/><span style="color:#7a6f65">Attila Lab</span></p>',
  '["business_name","preview_image_url","demo_url","cta_block","preview_image_block","whatsapp_block","sender_name"]'::jsonb
from public.message_templates mt
where mt.key = 'visual-intro-v1'
  and not exists (
    select 1 from public.message_template_versions v where v.template_id = mt.id and v.version = 2
  );

update public.campaigns c
set message_template_version_id = v2.id
from public.message_templates mt
join public.message_template_versions v1
  on v1.template_id = mt.id and v1.version = 1
join public.message_template_versions v2
  on v2.template_id = mt.id and v2.version = 2
where mt.key = 'visual-intro-v1'
  and c.message_template_version_id = v1.id;
