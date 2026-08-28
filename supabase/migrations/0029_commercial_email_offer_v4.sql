-- Email commerciale v4: proposta chiara, offerta visibile e contatti diretti.
-- Le versioni sono immutabili: crea la v4 e sposta le campagne del template attivo.

insert into public.message_template_versions (
  workspace_id,
  template_id,
  version,
  subject,
  body,
  variables
)
select
  mt.workspace_id,
  mt.id,
  4,
  '{{business_name}} — una proposta pronta da vedere',
  E'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#292524">\n<tr><td style="padding:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#a16207">Proposta riservata</td></tr>\n<tr><td style="padding:0 0 14px;font-family:Georgia,serif;font-size:30px;line-height:1.15;color:#1c1917">Abbiamo immaginato il nuovo sito di {{business_name}}.</td></tr>\n<tr><td style="padding:0 0 18px;font-size:16px;line-height:1.6;color:#57534e">Buongiorno, abbiamo preparato una proposta visiva per <strong>{{business_name}}</strong>{{city_phrase}}, usando soltanto le informazioni pubbliche dell''attività.</td></tr>\n{{personalized_insight_block}}\n<tr><td style="padding:0 0 20px">{{offer_block}}</td></tr>\n<tr><td style="padding:0">{{preview_image_block}}</td></tr>\n<tr><td style="padding:22px 0 8px">{{cta_block}}</td></tr>\n<tr><td style="padding:0">{{whatsapp_block}}{{call_block}}</td></tr>\n<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:#78716c">L''anteprima è gratuita e senza impegno. Prezzo e tempi si riferiscono alla proposta base; eventuali richieste aggiuntive vengono concordate prima.</td></tr>\n<tr><td style="padding:20px 0 0;font-size:15px;line-height:1.55;color:#292524">A presto,<br/><strong>{{sender_name}}</strong></td></tr>\n</table>',
  '["business_name","city_phrase","preview_image_url","demo_url","cta_block","preview_image_block","offer_block","whatsapp_block","call_block","personalized_insight_block","sender_name","offer_price","delivery_time"]'::jsonb
from public.message_templates mt
where mt.key = 'visual-intro-v1'
  and not exists (
    select 1
    from public.message_template_versions v
    where v.template_id = mt.id and v.version = 4
  );

update public.campaigns c
set message_template_version_id = v4.id
from public.message_templates mt
join public.message_template_versions v4
  on v4.template_id = mt.id and v4.version = 4
where mt.key = 'visual-intro-v1'
  and c.message_template_id = mt.id
  and c.status <> 'COMPLETED';
