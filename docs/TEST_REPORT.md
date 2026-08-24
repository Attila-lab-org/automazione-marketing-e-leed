# TEST REPORT — Restaurant Premium V3 commercial polish

**Data:** 2026-08-24 · **Slice:** V3 final polish (mobile ATF, CTA/owner dead-ends, docs, QA)

## Ambiente

Windows dev. Supabase remoto non eseguito in CI locale — Vitest + Next.js build.

## Risultati (eseguiti in questa slice)

| Verifica | Comando | Esito |
|---|---|---|
| Unit + integration | `npm test` | **141/141** (16 file, incl. `restaurant-premium-v3`, `owner-interesse-route`) |
| Typecheck | `npx tsc --noEmit` | **OK** |
| Lint | `npm run lint` | **0 errori** (warning stub live pre-esistenti) |
| Build | `npm run build` | **OK** |

## V3 polish — copertura aggiunta

- Restaurant CTA: booking URL → `tel:` → `#contatti` (mai `#prenota`)
- Owner CTA: `/demo/[slug]/interesse` → `OWNER_CTA_CLICKED` + redirect `OWNER_CONTACT_URL` (no mailto senza recipient)
- V1/V2 renderer keys immutati; V3 minimal data + email preview path
- QA screenshots: `docs/qa/v3-*-first|full.png`, `v3-email-preview.png`, mobile 430 first

## Non coperto (go-live)

- Inbound reply provider
- Resend live + webhook Svix end-to-end
- Pack fotografico V3 coerente (placeholder misto documentato)
