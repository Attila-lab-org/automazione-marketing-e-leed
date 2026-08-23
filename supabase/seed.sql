-- ============================================================================
-- supabase/seed.sql — eseguito da `supabase db reset` SOLO in locale.
-- Il seed vero vive in public.seed_baseline() (migration 0010, §13 piano):
-- qui lo invochiamo direttamente, senza bisogno di app.seed_mode.
-- MAI dati reali o secret (§22.1, §23.1).
-- ============================================================================

select public.seed_baseline();
