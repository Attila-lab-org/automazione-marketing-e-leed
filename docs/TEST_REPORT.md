# TEST REPORT — Phase D.2 Final Reliability

**Data:** 2026-08-24 · **Slice:** Phase D.2 (defer / preview / SSRF DNS / cron docs)

## Ambiente

Windows dev. Supabase remoto non eseguito in CI locale — Vitest + Next.js build.

## Risultati (eseguiti in questa slice)

| Verifica | Comando | Esito |
|---|---|---|
| Unit + integration | `npm test` | **127/127** (14 file, incl. `phase-d2-defer.test.ts`, `phase-d1-e2e.test.ts`) |
| Typecheck | `npx tsc --noEmit` | **OK** |
| Lint | `npm run lint` | **0 errori** (warning stub live pre-esistenti) |
| Build | `npm run build` | **OK** |

## Phase D.2 — copertura aggiunta

- `defer()` ripristina attempt budget; job resta `QUEUED` con `next_retry_at`, non `FAILED`
- 50 SEND con cap 20/h → 30 deferred, 0 FAILED, reclaim dopo slot
- Campagna 20:00 + window 09–18 UTC → `OUTSIDE_SEND_WINDOW` defer fino a mattina
- Pause / daily limit → disposition `defer`
- E2E MOCK path D.1 invariato (5 restaurant → follow-up stop)

## Production cron

Route corretta: **`/api/cron/jobs`** (`vercel.json` `*/5 * * * *`, Bearer `CRON_SECRET`).  
`/api/jobs/run` = flush manuale admin only.

## Non coperto (go-live)

- Inbound reply provider
- Resend live + webhook Svix end-to-end
- DNS rebinding race beyond resolve-before-fetch (mitigated; not full connect-time pin)
