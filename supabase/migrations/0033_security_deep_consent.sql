-- ============================================================================
-- 0033_security_deep_consent.sql
-- Permesso anche al telefono, prima della mail. Nessun attacco automatico.
-- ============================================================================

alter table public.security_targets drop constraint if exists security_targets_status_check;
alter table public.security_targets
  add constraint security_targets_status_check
  check (status in (
    'listed',
    'audited',
    'skipped',
    'email_draft',
    'email_sent',
    'failed',
    'deep_open',
    'deep_done'
  ));

alter table public.security_targets
  add column if not exists consent_channel text
    check (consent_channel is null or consent_channel in ('phone', 'letter', 'in_person'));
alter table public.security_targets
  add column if not exists consent_note text;
alter table public.security_targets
  add column if not exists consent_at timestamptz;
alter table public.security_targets
  add column if not exists deep_notes text;
