-- Allinea l'agente commerciale all'offerta mostrata in email e demo.
-- Mantiene lo storico creando una nuova versione del playbook corrente.

with previous as (
  update public.commercial_playbooks
  set is_current = false, updated_at = now()
  where is_current = true
  returning *
)
insert into public.commercial_playbooks (
  workspace_id,
  version,
  is_current,
  brand,
  offer,
  pricing,
  discount,
  qualification,
  call_policy,
  promise_policy,
  human_escalation,
  autonomy
)
select
  workspace_id,
  version + 1,
  true,
  brand,
  jsonb_build_object(
    'key', 'website_upgrade',
    'description', 'Sito professionale per attività locali, da 350 €, con consegna della proposta base in 24 ore',
    'allowedFeatures', jsonb_build_array(
      'sito vetrina',
      'prenotazioni online',
      'galleria',
      'menu visibile',
      'contatti chiari',
      'consegna della proposta base in 24 ore'
    )
  ),
  pricing || jsonb_build_object(
    'mode', 'range',
    'aiMayCommunicate', true,
    'min', 350,
    'max', 1000,
    'currency', 'EUR'
  ),
  discount,
  qualification,
  call_policy,
  jsonb_build_object(
    'neverPromise', jsonb_build_array(
      'posizionamento garantito',
      'numero di clienti',
      'tempi diversi dalle 24 ore della proposta base senza conferma',
      'sconti non autorizzati',
      'funzionalità non in offerta'
    )
  ),
  human_escalation || jsonb_build_object('price', false),
  autonomy
from previous;
