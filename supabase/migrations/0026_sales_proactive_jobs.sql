-- Attiva i next_step_at commerciali tramite la job queue esistente.
-- Additivo e idempotente: non abilita invii esterni automatici.
do $$ begin
  alter type public.job_type add value if not exists 'SALES_PROACTIVE_STEP';
exception
  when duplicate_object then null;
end $$;
