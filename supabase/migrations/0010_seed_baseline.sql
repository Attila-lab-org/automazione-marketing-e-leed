-- ============================================================================
-- 0010_seed_baseline.sql
-- Contenuto (§16.3): categorie/template/test data NON-production (§22.1).
-- Riferimenti: MASTER_SPEC §22.1, §23.1; DATABASE_MIGRATION_PLAN §13.
--
-- Dati fake verificabili: domini siti su example.com / example.org (RFC 2606),
-- email su dominio riservato example.com — MAI indirizzi reali, MAI secret.
--
-- Modalità (§13.1 piano): il seed vive nella funzione public.seed_baseline().
-- - La migration la esegue SOLO se app.seed_mode = 'on' (guardia esplicita,
--   default off → in produzione il seed non parte mai).
-- - supabase/seed.sql la invoca direttamente per `supabase db reset` locale.
-- ============================================================================

create or replace function public.seed_baseline()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws      uuid;
  v_tpl1    uuid;  v_tpl1v   uuid;
  v_tpl2    uuid;  v_tpl2v   uuid;
  v_mt1     uuid;  v_mt1v    uuid;
  v_mt2     uuid;  v_mt2v    uuid;
  v_seq     uuid;
  v_lead    uuid;
  v_thread  uuid;
  v_msg     uuid;
  v_i       int;
  v_evt_types public.message_event_type[] := array[
    'DELIVERED','OPENED','OPENED','CLICKED','OPENED'
  ]::public.message_event_type[];
begin
  -- --------------------------------------------------------------------------
  -- Workspace demo (§13.2 piano): default_policy_mode = 'MANUAL' (safe-by-default)
  -- --------------------------------------------------------------------------
  insert into public.workspaces (name, slug, default_policy_mode, default_policy, settings)
  values (
    'Demo Workspace', 'demo', 'MANUAL',
    '{"discovery":"MANUAL","enrichment":"MANUAL","website_analysis":"MANUAL","demo_generation":"MANUAL","screenshot":"MANUAL","message_generation":"AUTO","send":"MANUAL","followup":"OFF"}',
    '{"rate_limit_per_hour": 20, "retention_days": 180}'
  )
  on conflict (slug) do nothing
  returning id into v_ws;

  if v_ws is null then
    select id into v_ws from public.workspaces where slug = 'demo';
  end if;

  -- --------------------------------------------------------------------------
  -- Provider connections: 4 righe, tutte MOCK / NOT_CONFIGURED (§13.2 piano).
  -- Nessun secret: solo metadata non sensibili (§18).
  -- --------------------------------------------------------------------------
  insert into public.provider_connections (workspace_id, provider, mode, status, display_config)
  select v_ws, p.provider, 'MOCK', 'NOT_CONFIGURED', p.cfg
  from (values
    ('GOOGLE_PLACES'::public.provider_type, '{"note": "configura API key lato server"}'::jsonb),
    ('RESEND'::public.provider_type,        '{"from_domain": "outreach.example.com"}'::jsonb),
    ('BROWSER_WORKER'::public.provider_type,'{"adapter": "kimi-webbridge"}'::jsonb),
    ('AI'::public.provider_type,            '{"model": "mock-model"}'::jsonb)
  ) as p(provider, cfg)
  on conflict (workspace_id, provider) do nothing;

  -- --------------------------------------------------------------------------
  -- Feature flags: kill switch §19.2 tutti disattivati di default
  -- --------------------------------------------------------------------------
  insert into public.workspace_feature_flags (workspace_id, key, value)
  select v_ws, f.key, f.val
  from (values
    ('OUTREACH_PAUSED_ALL',    '{"enabled": false, "reason": "seed default"}'::jsonb),
    ('DISCOVERY_PAUSED',       '{"enabled": false, "reason": "seed default"}'::jsonb),
    ('BROWSER_WORKERS_PAUSED', '{"enabled": false, "reason": "seed default"}'::jsonb)
  ) as f(key, val)
  on conflict (workspace_id, key) do nothing;

  -- --------------------------------------------------------------------------
  -- Skip idempotente: se il workspace ha già i lead seed, non duplicare nulla
  -- --------------------------------------------------------------------------
  if exists (select 1 from public.leads where workspace_id = v_ws limit 1) then
    raise notice 'seed_baseline: workspace % già seedato, skip dati demo', v_ws;
    return;
  end if;

  -- --------------------------------------------------------------------------
  -- 5 categorie demo (§13.2 piano): realizzate come valori category dei lead +
  -- tags + segments di esempio (nessuna tabella categorie in §16.1)
  -- --------------------------------------------------------------------------
  insert into public.tags (workspace_id, name, color)
  select v_ws, c.name, c.color
  from (values
    ('ristoranti',   '#E11D48'),
    ('parrucchieri', '#8B5CF6'),
    ('idraulici',    '#0EA5E9'),
    ('dentisti',     '#10B981'),
    ('palestre',     '#F59E0B')
  ) as c(name, color)
  where not exists (
    select 1 from public.tags t where t.workspace_id = v_ws and lower(t.name) = lower(c.name)
  );

  insert into public.segments (workspace_id, name, description, filters)
  values
    (v_ws, 'Ristoranti Milano con sito', 'Segmento seed: ristoranti a Milano con sito web',
     '{"category": "ristoranti", "city": "Milano", "has_website": true}'),
    (v_ws, 'Alta opportunità (score >= 70)', 'Segmento seed: lead con score alto',
     '{"score_min": 70, "confidence_min": 60}'),
    (v_ws, 'Senza email', 'Segmento seed: lead senza email da arricchire',
     '{"has_email": false}');

  -- --------------------------------------------------------------------------
  -- 2 landing template (categoria prioritaria: ristoranti) con versioni pubblicate
  -- --------------------------------------------------------------------------
  insert into public.website_templates (workspace_id, key, name, description, category)
  values
    (v_ws, 'landing-ristorante-classic', 'Ristorante Classic', 'Landing hero + menu + prenotazione', 'ristoranti'),
    (v_ws, 'landing-ristorante-modern',  'Ristorante Modern',  'Landing visuale con gallery e recensioni', 'ristoranti')
  on conflict (workspace_id, key) do nothing;

  select id into v_tpl1 from public.website_templates where workspace_id = v_ws and key = 'landing-ristorante-classic';
  select id into v_tpl2 from public.website_templates where workspace_id = v_ws and key = 'landing-ristorante-modern';

  insert into public.website_template_versions
    (workspace_id, template_id, version, layout_key, component_version, schema, default_content, is_published)
  values
    (v_ws, v_tpl1, 1, 'hero-menu-booking', '1.0.0',
     '{"fields": ["business_name","logo","palette","hero_title","hero_subtitle","hero_image","about_text","services","highlights","gallery","phone","email","address","opening_hours","social_links","primary_cta","secondary_cta","section_visibility"]}',
     '{"primary_cta": "Prenota un tavolo", "secondary_cta": "Scopri il menu"}', true),
    (v_ws, v_tpl2, 1, 'visual-gallery-reviews', '1.0.0',
     '{"fields": ["business_name","logo","palette","hero_title","hero_subtitle","hero_image","about_text","services","highlights","gallery","phone","email","address","opening_hours","social_links","primary_cta","secondary_cta","section_visibility"]}',
     '{"primary_cta": "Contattaci", "secondary_cta": "Guarda la gallery"}', true)
  on conflict (template_id, version) do nothing;

  select id into v_tpl1v from public.website_template_versions where template_id = v_tpl1 and version = 1;
  select id into v_tpl2v from public.website_template_versions where template_id = v_tpl2 and version = 1;

  -- --------------------------------------------------------------------------
  -- 2 message template (con versioni) + 1 follow-up sequence (versione, 2 step)
  -- --------------------------------------------------------------------------
  insert into public.message_templates (workspace_id, key, name, category)
  values
    (v_ws, 'intro-opportunity', 'Intro — opportunità sito', 'ristoranti'),
    (v_ws, 'followup-gentle',   'Follow-up gentile',       null)
  on conflict (workspace_id, key) do nothing;

  select id into v_mt1 from public.message_templates where workspace_id = v_ws and key = 'intro-opportunity';
  select id into v_mt2 from public.message_templates where workspace_id = v_ws and key = 'followup-gentle';

  insert into public.message_template_versions (workspace_id, template_id, version, subject, body, variables)
  values
    (v_ws, v_mt1, 1,
     'Un''idea per il sito di {{business_name}}',
     'Ciao, ho visto il sito di {{business_name}} a {{city}} e ho preparato una demo gratuita di come potrebbe apparire: {{demo_url}}. Se ti interessa, rispondi a questa email.',
     '["business_name","city","demo_url"]'),
    (v_ws, v_mt2, 1,
     'Re: un''idea per {{business_name}}',
     'Ciao, torno sul messaggio di qualche giorno fa: la demo per {{business_name}} è ancora disponibile qui: {{demo_url}}. Nessun impegno.',
     '["business_name","demo_url"]')
  on conflict (template_id, version) do nothing;

  select id into v_mt1v from public.message_template_versions where template_id = v_mt1 and version = 1;
  select id into v_mt2v from public.message_template_versions where template_id = v_mt2 and version = 1;

  insert into public.followup_sequences (workspace_id, name, description)
  values (v_ws, 'Sequenza standard 2 step', 'Follow-up a +3 e +7 giorni senza reply')
  on conflict (workspace_id, name) do nothing;

  select id into v_seq from public.followup_sequences where workspace_id = v_ws and name = 'Sequenza standard 2 step';

  insert into public.followup_sequence_versions (workspace_id, sequence_id, version, steps)
  values (v_ws, v_seq, 1, jsonb_build_array(
    jsonb_build_object('step', 1, 'delay_days', 3, 'message_template_version_id', v_mt2v, 'conditions', '{"no_reply": true}'),
    jsonb_build_object('step', 2, 'delay_days', 7, 'message_template_version_id', v_mt2v, 'conditions', '{"no_reply": true}')
  ))
  on conflict (sequence_id, version) do nothing;

  -- --------------------------------------------------------------------------
  -- 20 lead fake realistici (§22.1): stati/score diversi, con/senza sito,
  -- con/senza email, città diverse. Domini RFC 2606 (example.com/example.org).
  -- google_place_id = 'seed-place-NN' → la unique parziale rende il blocco
  -- rieseguibile senza duplicati.
  -- --------------------------------------------------------------------------
  insert into public.leads (
    workspace_id, google_place_id, name, category, subcategory,
    address, city, region, postal_code, country, lat, lng,
    website_url, normalized_domain, phone, normalized_phone,
    email, normalized_email,
    business_status, processing_status, current_score, current_confidence,
    rating, review_count, google_last_enriched_at
  )
  select v_ws, l.place_id, l.name, l.category, l.subcategory,
         l.address, l.city, l.region, l.cap, 'IT', l.lat, l.lng,
         l.website, l.domain, l.phone, l.nphone, l.email, l.nemail,
         l.bstatus::public.business_status, l.pstatus::public.processing_status,
         l.score, l.conf, l.rating, l.reviews, now() - (l.n || ' days')::interval
  from (values
    -- n, place_id, name, category, subcategory, address, city, region, cap, lat, lng,
    -- website, domain, phone, nphone, email, nemail, bstatus, pstatus, score, conf, rating, reviews
    ( 1,'seed-place-001','Ristorante Da Mario','ristoranti','cucina italiana','Via Roma 12','Milano','Lombardia','20121',45.4642,9.1900,'https://damario.example.com','damario.example.com','+39 02 555 0101','39025550101','info@damario.example.com','info@damario.example.com','CONTACTED','IDLE',88,92,4.3,214),
    ( 2,'seed-place-002','Trattoria Al Vecchio Forno','ristoranti','pizzeria','Corso Italia 5','Milano','Lombardia','20122',45.4600,9.1950,'https://vecchioforno.example.com','vecchioforno.example.com','+39 02 555 0102','39025550102','info@vecchioforno.example.com','info@vecchioforno.example.com','REPLIED','IDLE',91,95,4.6,532),
    ( 3,'seed-place-003','Osteria La Lanterna','ristoranti','cucina regionale','Piazza Duomo 3','Milano','Lombardia','20123',45.4641,9.1919,null,null,'+39 02 555 0103','39025550103',null,null,'QUALIFIED','IDLE',64,70,4.1,98),
    ( 4,'seed-place-004','Pizzeria Bella Napoli','ristoranti','pizzeria','Via Torino 44','Torino','Piemonte','10123',45.0703,7.6869,'https://bellanapoli.example.org','bellanapoli.example.org','+39 011 555 0104','390115550104','pizzeria@bellanapoli.example.org','pizzeria@bellanapoli.example.org','CAMPAIGN_READY','IDLE',79,84,4.4,301),
    ( 5,'seed-place-005','Sushi Bar Kaizen','ristoranti','giapponese','Via Mazzini 8','Bologna','Emilia-Romagna','40121',44.4949,11.3426,'https://kaizen.example.com','kaizen.example.com','+39 051 555 0105','390515550105','ciao@kaizen.example.com','ciao@kaizen.example.com','NEW','IDLE',null,null,4.0,56),
    ( 6,'seed-place-006','Parrucchiere Stile Libero','parrucchieri','unisex','Via Garibaldi 21','Milano','Lombardia','20121',45.4700,9.1800,'https://stilelibero.example.com','stilelibero.example.com','+39 02 555 0106','39025550106','info@stilelibero.example.com','info@stilelibero.example.com','INTERESTED','IDLE',85,90,4.7,189),
    ( 7,'seed-place-007','Hair Studio Lorenz','parrucchieri','donna','Via Verdi 9','Verona','Veneto','37121',45.4384,10.9916,null,null,'+39 045 555 0107','390455550107',null,null,'NEW','ENRICHING',null,null,4.2,77),
    ( 8,'seed-place-008','Barber Shop Old Town','parrucchieri','uomo','Via dei Fabbri 2','Firenze','Toscana','50122',43.7696,11.2558,'https://oldtownbarber.example.com','oldtownbarber.example.com','+39 055 555 0108','390555550108','book@oldtownbarber.example.com','book@oldtownbarber.example.com','QUALIFIED','IDLE',72,81,4.8,412),
    ( 9,'seed-place-009','Salone Bellezza Elite','parrucchieri','estetica','Viale Europa 30','Roma','Lazio','00144',41.8330,12.4670,'https://elitebeauty.example.org','elitebeauty.example.org','+39 06 555 0109','39065550109',null,null,'NEW','IDLE',null,null,3.9,45),
    (10,'seed-place-010','Idraulica Rossi & Figli','idraulici','pronto intervento','Via delle Botteghe 14','Genova','Liguria','16123',44.4056,8.9463,'https://rossifigli.example.com','rossifigli.example.com','+39 010 555 0110','390105550110','assistenza@rossifigli.example.com','assistenza@rossifigli.example.com','CONTACTED','IDLE',76,78,4.5,167),
    (11,'seed-place-011','Termoidraulica Bianchi','idraulici','impianti','Via Po 18','Torino','Piemonte','10124',45.0620,7.6790,null,null,'+39 011 555 0111','390115550111',null,null,'QUALIFIED','ANALYZING',58,66,4.2,89),
    (12,'seed-place-012','Pronto Casa Idraulica','idraulici','emergenze 24h','Via Napoli 51','Napoli','Campania','80134',40.8518,14.2681,'https://prontocasa.example.com','prontocasa.example.com','+39 081 555 0112','390815550112','info@prontocasa.example.com','info@prontocasa.example.com','NOT_INTERESTED','IDLE',49,60,3.8,120),
    (13,'seed-place-013','Studio Dentistico Sorriso','dentisti','odontoiatria','Corso Vittorio 77','Palermo','Sicilia','90134',38.1157,13.3615,'https://studiosorriso.example.com','studiosorriso.example.com','+39 091 555 0113','390915550113','segreteria@studiosorriso.example.com','segreteria@studiosorriso.example.com','WON','IDLE',93,97,4.9,628),
    (14,'seed-place-014','Dentista Dott. Ferri','dentisti','ortodonzia','Via Cavour 6','Bari','Puglia','70121',41.1171,16.8719,'https://ferri.example.org','ferri.example.org','+39 080 555 0114','390805550114','info@ferri.example.org','info@ferri.example.org','LOST','IDLE',35,50,4.1,134),
    (15,'seed-place-015','Centro Odontoiatrico Aurora','dentisti','odontoiatria','Via Dante 11','Padova','Veneto','35139',45.4064,11.8768,null,null,'+39 049 555 0115','390495550115',null,null,'NEW','SCORING',null,null,4.4,201),
    (16,'seed-place-016','Palestra IronWorks','palestre','fitness','Via dello Sport 3','Milano','Lombardia','20126',45.5000,9.2300,'https://ironworks.example.com','ironworks.example.com','+39 02 555 0116','39025550116','join@ironworks.example.com','join@ironworks.example.com','SUPPRESSED','IDLE',67,74,4.3,276),
    (17,'seed-place-017','Yoga Studio Ananda','palestre','yoga','Via delle Rose 19','Firenze','Toscana','50123',43.7720,11.2480,'https://ananda.example.org','ananda.example.org','+39 055 555 0117','390555550117','namaste@ananda.example.org','namaste@ananda.example.org','QUALIFIED','IDLE',70,72,4.9,98),
    (18,'seed-place-018','CrossFit La Rocca','palestre','crossfit','Via Castello 25','Perugia','Umbria','06121',43.1107,12.3908,null,null,'+39 075 555 0118','390755550118',null,null,'NEW','IDLE',null,null,4.5,143),
    (19,'seed-place-019','FitLab Studio','palestre','personal training','Via Emilia 101','Modena','Emilia-Romagna','41121',44.6471,10.9252,'https://fitlab.example.com','fitlab.example.com','+39 059 555 0119','390595550119','info@fitlab.example.com','info@fitlab.example.com','CAMPAIGN_READY','MESSAGE_GENERATING',82,86,4.6,210),
    (20,'seed-place-020','Ristorante Il Gabbiano','ristoranti','pesce','Lungomare 40','Rimini','Emilia-Romagna','47921',44.0678,12.5695,'https://ilgabbiano.example.com','ilgabbiano.example.com','+39 0541 555 0120','3905415550120','info@ilgabbiano.example.com','info@ilgabbiano.example.com','CONTACTED','IDLE',74,79,4.2,355)
  ) as l(n, place_id, name, category, subcategory, address, city, region, cap, lat, lng,
        website, domain, phone, nphone, email, nemail, bstatus, pstatus, score, conf, rating, reviews)
  order by l.n
  on conflict (workspace_id, google_place_id) where google_place_id is not null do nothing;

  -- Contatti primari in lead_contacts (convenience fields ↔ righe §16.2)
  insert into public.lead_contacts (workspace_id, lead_id, type, value, normalized_value, label, is_primary, source)
  select workspace_id, id, 'EMAIL', email, normalized_email, 'principale', true, 'GOOGLE_PLACES'
  from public.leads
  where workspace_id = v_ws and email is not null
    and google_place_id like 'seed-place-%'
  on conflict do nothing;

  insert into public.lead_contacts (workspace_id, lead_id, type, value, normalized_value, label, is_primary, source)
  select workspace_id, id, 'PHONE', phone, normalized_phone, 'centralino', true, 'GOOGLE_PLACES'
  from public.leads
  where workspace_id = v_ws and phone is not null
    and google_place_id like 'seed-place-%'
  on conflict do nothing;

  -- Provenance discovery (§13, Decision Trace §19.1)
  insert into public.lead_sources (workspace_id, lead_id, source_type, external_id, query_snapshot)
  select workspace_id, id, 'GOOGLE_PLACES_DISCOVERY', google_place_id,
         jsonb_build_object('category', category, 'city', city, 'radius_km', 15, 'seed', true)
  from public.leads
  where workspace_id = v_ws and google_place_id like 'seed-place-%';

  -- --------------------------------------------------------------------------
  -- Suppression demo (§12.2, §18): lead 016 SUPPRESSED per hard bounce
  -- --------------------------------------------------------------------------
  select id into v_lead from public.leads where workspace_id = v_ws and google_place_id = 'seed-place-016';
  insert into public.suppression_list (workspace_id, email, normalized_email, reason, note)
  values (v_ws, 'join@ironworks.example.com', 'join@ironworks.example.com', 'HARD_BOUNCE', 'seed: bounce simulato')
  on conflict (workspace_id, normalized_email) do nothing;

  -- --------------------------------------------------------------------------
  -- Eventi email fake per Inbox/Analytics (§22.1): thread + messages +
  -- message_events (~30) per i lead con email in stato outreach.
  -- --------------------------------------------------------------------------
  for v_lead in
    select id from public.leads
    where workspace_id = v_ws
      and google_place_id in ('seed-place-001','seed-place-002','seed-place-006',
                              'seed-place-010','seed-place-013','seed-place-016')
    order by google_place_id
  loop
    insert into public.message_threads (workspace_id, lead_id, subject, status, unread_count, last_message_at)
    select v_ws, l.id, 'Un''idea per il sito di ' || l.name,
           case when l.google_place_id = 'seed-place-002' then 'NEEDS_REPLY'::public.thread_status
                else 'OPEN'::public.thread_status end,
           case when l.google_place_id = 'seed-place-002' then 1 else 0 end,
           now() - '2 days'::interval
    from public.leads l where l.id = v_lead
    returning id into v_thread;

    -- messaggio outbound (snapshot immutabile §11)
    insert into public.messages
      (workspace_id, thread_id, lead_id, direction, provider, provider_message_id,
       from_address, to_address, subject, body_snapshot, sequence_step, sent_at)
    select v_ws, v_thread, l.id, 'OUTBOUND', 'resend',
           'seed-msg-' || l.google_place_id || '@resend',
           'outreach@example.com', l.normalized_email,
           'Un''idea per il sito di ' || l.name,
           'Ciao, ho preparato una demo gratuita per ' || l.name || ': https://demo.example.com/d/' || lower(regexp_replace(l.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-seed01',
           0, now() - '3 days'::interval
    from public.leads l where l.id = v_lead
    returning id into v_msg;

    -- eventi delivery/engagement fake
    for v_i in 1..5 loop
      insert into public.message_events
        (workspace_id, message_id, event_type, provider_event_id, payload, occurred_at)
      values
        (v_ws, v_msg, v_evt_types[v_i],
         'seed-evt-' || lpad((v_i)::text, 2, '0') || '-' || v_msg::text,
         jsonb_build_object('seed', true),
         now() - '3 days'::interval + (v_i || ' hours')::interval);
    end loop;

    -- reply inbound fake per il lead REPLIED (seed-place-002)
    if exists (select 1 from public.leads where id = v_lead and business_status = 'REPLIED') then
      insert into public.messages
        (workspace_id, thread_id, lead_id, direction, provider, provider_message_id,
         from_address, to_address, subject, body_snapshot, sequence_step, sent_at)
      select v_ws, v_thread, l.id, 'INBOUND', 'resend',
             'seed-msg-inbound-' || l.google_place_id || '@resend',
             l.normalized_email, 'outreach@example.com',
             'Re: Un''idea per il sito di ' || l.name,
             'Grazie, la demo è interessante. Possiamo sentirci la prossima settimana?',
             0, now() - '1 day'::interval
      from public.leads l where l.id = v_lead;

      insert into public.message_events (workspace_id, message_id, event_type, payload, occurred_at)
      values (v_ws, v_msg, 'REPLIED', '{"seed": true}', now() - '1 day'::interval);
    end if;
  end loop;

  -- --------------------------------------------------------------------------
  -- Activity log demo (timeline §7.2, append-only §16.4)
  -- --------------------------------------------------------------------------
  insert into public.activity_log
    (workspace_id, actor_type, entity_type, entity_id, lead_id, category, event_type, message, data)
  select v_ws, 'SYSTEM', 'lead', l.id, l.id, 'BUSINESS', 'LEAD_CREATED',
         'Lead importato dal seed demo',
         jsonb_build_object('seed', true, 'google_place_id', l.google_place_id)
  from public.leads l
  where l.workspace_id = v_ws and l.google_place_id like 'seed-place-%';

  raise notice 'seed_baseline: dati demo creati per workspace %', v_ws;
end $$;

-- Funzione dev-only: non chiamabile da ruoli client (§18, §23.1)
revoke all on function public.seed_baseline() from public, anon, authenticated;
grant execute on function public.seed_baseline() to service_role;

-- ----------------------------------------------------------------------------
-- Guardia esplicita (§13.1 piano): la migration esegue il seed SOLO se
-- app.seed_mode = 'on'. Default off → in production non parte mai.
-- Locale: `supabase db reset` esegue supabase/seed.sql che chiama
-- seed_baseline() direttamente.
-- ----------------------------------------------------------------------------
do $$
begin
  if coalesce(current_setting('app.seed_mode', true), 'off') <> 'on' then
    raise notice 'seed_mode non attivo: seed saltato';
    return;
  end if;
  perform public.seed_baseline();
end $$;
