-- Corregge l'indice in ambienti che hanno già applicato la prima versione.
-- Una sola bozza può essere in invio; le righe già inviate restano storico immutabile.

drop index if exists public.security_outreach_one_active_per_audit_idx;

create unique index security_outreach_one_active_per_audit_idx
  on public.security_outreach (target_id, audit_id)
  where audit_id is not null
    and status = 'draft';
