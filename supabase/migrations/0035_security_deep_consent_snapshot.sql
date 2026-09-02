-- Conserva il consenso usato per autorizzare ogni singolo secondo report.

alter table public.security_deep_audits
  add column if not exists consent_channel text
    check (consent_channel is null or consent_channel in ('phone', 'letter', 'in_person'));

alter table public.security_deep_audits
  add column if not exists consent_at timestamptz;
