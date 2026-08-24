# TEST REPORT — Phase D Commercial Core

**Data:** 2026-08-24 · **Slice:** Phase D (uncommitted)

## Ambiente

Windows dev, `npm install` con `resend` + `svix`. Supabase remoto non eseguito in CI locale — test unitari + build Next.js.

## Risultati

| Verifica | Comando | Esito |
|---|---|---|
| Unit test | `npm test` | **109/109 verdi** (10 file, incl. `phase-d.test.ts`) |
| Typecheck | `npx tsc --noEmit` | **OK** |
| Lint | `npm run lint` | **0 errori** (5 warning stub live pre-esistenti) |
| Build | `npm run build` | **OK** — route dinamiche demo + 15 API |

## Phase D — copertura test aggiunta

- Template matching: dentist → null, no fallback Restaurant Premium
- Renderer registry: V1/V2 distinti, unknown → `UnsupportedRendererError`
- V2 data: nessuna headline/recensione inventata; rating/review_count da lead
- Email enrichment: mailto trovato; assenza email → NOT_FOUND
- Send Guard: kill switch globale blocca send
- Resend mock: idempotency key impedisce doppio send
- Auth surface: `/demo/*` e email-preview pubblici

## Non coperto in unit test (integrazione manuale)

- Job batch end-to-end su Supabase (`claim_job` RPC)
- Email preview ImageResponse rendering visivo
- Migration 0013 apply su DB remoto
- Resend live webhook con firma Svix reale

## Comandi

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
