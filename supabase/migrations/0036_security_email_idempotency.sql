-- Impedisce doppi invii dello stesso primo report (anche con doppio clic).

with ranked_drafts as (
  select
    id,
    row_number() over (
      partition by target_id, audit_id
      order by created_at desc, id desc
    ) as position
  from public.security_outreach
  where audit_id is not null
    and status = 'draft'
)
update public.security_outreach outreach
set
  status = 'failed',
  error = coalesce(outreach.error, 'Bozza duplicata precedente al blocco dei doppi invii.')
from ranked_drafts ranked
where outreach.id = ranked.id
  and ranked.position > 1;

create unique index if not exists security_outreach_one_active_per_audit_idx
  on public.security_outreach (target_id, audit_id)
  where audit_id is not null
    and status = 'draft';
