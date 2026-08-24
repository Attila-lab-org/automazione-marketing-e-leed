-- ============================================================================
-- 0016_campaign_delivery_test_mode.sql
-- Safe Live Email Test Mode: campaign PRODUCTION|TEST + message recipient audit.
-- ============================================================================

do $$ begin
  create type public.campaign_delivery_mode as enum ('PRODUCTION', 'TEST');
exception
  when duplicate_object then null;
end $$;

alter table public.campaigns
  add column if not exists delivery_mode public.campaign_delivery_mode not null default 'PRODUCTION';

alter table public.campaigns
  add column if not exists test_recipient text;

comment on column public.campaigns.delivery_mode is
  'PRODUCTION = send to lead email; TEST = send only to test_recipient (allowlisted).';
comment on column public.campaigns.test_recipient is
  'Required when delivery_mode=TEST. Never written to leads.email.';

-- Audit: intended (commercial lead) vs actual (Resend destination)
alter table public.messages
  add column if not exists intended_recipient text;

alter table public.messages
  add column if not exists actual_delivery_recipient text;

comment on column public.messages.intended_recipient is
  'Commercial lead email at send time (never mutated on leads by TEST mode).';
comment on column public.messages.actual_delivery_recipient is
  'Address actually passed to Resend (equals to_address).';
comment on column public.messages.to_address is
  'Actual delivery address (Resend to). Prefer actual_delivery_recipient for new reads.';
