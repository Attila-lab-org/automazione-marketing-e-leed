-- Le demo sono temporanee: 36 ore dalla creazione.

alter table public.demo_sites
  alter column expires_at set default (now() + interval '36 hours');

update public.demo_sites
set expires_at = created_at + interval '36 hours'
where expires_at is null;

create index if not exists demo_sites_expiry_idx
  on public.demo_sites (expires_at)
  where expires_at is not null;
