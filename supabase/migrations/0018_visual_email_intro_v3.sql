-- Email commerciale v3: tono semplice, trasparente e senza termini tecnici.
-- Le versioni sono immutabili: crea la v3 e aggiorna solo le campagne ancora sulla v2.

insert into public.message_template_versions (workspace_id, template_id, version, subject, body, variables)
select
  mt.workspace_id,
  mt.id,
  3,
  'Una proposta visiva per {{business_name}}',
  E'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Georgia,serif">\n<tr><td style="padding:0 0 16px;font-size:16px;line-height:1.55;color:#2c241e">Buongiorno,</td></tr>\n<tr><td style="padding:0 0 20px;font-size:16px;line-height:1.55;color:#2c241e">abbiamo immaginato come potrebbe presentarsi online <strong>{{business_name}}</strong>{{city_phrase}}, partendo dalle informazioni pubbliche dell''attività.</td></tr>\n<tr><td style="padding:0">{{preview_image_block}}</td></tr>\n<tr><td style="padding:24px 0 8px">{{cta_block}}</td></tr>\n<tr><td style="padding:0">{{whatsapp_block}}</td></tr>\n<tr><td style="padding:24px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;color:#6b625a">È solo una proposta dimostrativa, senza alcun impegno.</td></tr>\n<tr><td style="padding:20px 0 0;font-size:15px;line-height:1.55;color:#2c241e">Cordiali saluti,<br/><strong>{{sender_name}}</strong></td></tr>\n</table>',
  '["business_name","city_phrase","preview_image_url","demo_url","cta_block","preview_image_block","whatsapp_block","sender_name"]'::jsonb
from public.message_templates mt
where mt.key = 'visual-intro-v1'
  and not exists (
    select 1
    from public.message_template_versions v
    where v.template_id = mt.id and v.version = 3
  );

update public.campaigns c
set message_template_version_id = v3.id
from public.message_templates mt
join public.message_template_versions v2
  on v2.template_id = mt.id and v2.version = 2
join public.message_template_versions v3
  on v3.template_id = mt.id and v3.version = 3
where mt.key = 'visual-intro-v1'
  and c.message_template_version_id = v2.id;
