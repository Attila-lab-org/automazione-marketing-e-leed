-- I messaggi successivi devono partire solo dopo una decisione manuale.
-- Ferma quelli già pianificati; il codice impedisce di crearne altri per impostazione predefinita.

update public.automation_jobs
set
  status = 'CANCELLED',
  cancelled_at = now(),
  completed_at = now(),
  error_code = 'AUTOMATIC_FOLLOWUP_DISABLED',
  error_detail = 'Messaggio successivo automatico disattivato su richiesta dell’amministratore'
where job_type = 'FOLLOWUP_STEP'
  and status in ('QUEUED', 'RETRYING');
