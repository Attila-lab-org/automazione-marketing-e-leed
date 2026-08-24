-- Blocco database: nessuna campagna può collegarsi a una sequenza automatica.
-- Quando sarà pronta la gestione manuale, una nuova migrazione potrà rimuovere il trigger.

create or replace function public.keep_automatic_followups_off()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.followup_sequence_id := null;
  new.followup_sequence_version_id := null;
  return new;
end;
$$;

revoke all on function public.keep_automatic_followups_off() from public, anon, authenticated;

drop trigger if exists campaigns_keep_automatic_followups_off on public.campaigns;
create trigger campaigns_keep_automatic_followups_off
before insert or update of followup_sequence_id, followup_sequence_version_id
on public.campaigns
for each row execute function public.keep_automatic_followups_off();

update public.campaigns
set
  followup_sequence_id = null,
  followup_sequence_version_id = null
where followup_sequence_id is not null
   or followup_sequence_version_id is not null;
