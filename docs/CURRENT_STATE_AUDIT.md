# CURRENT STATE AUDIT — Sales Automation OS

**Data audit:** Restaurant Premium V3 commercial polish (pre-freeze) — 2026-08-24  
**Baseline:** Phase D.1 `c194945` + D.2 `f0de564` + Restaurant Premium V3 `91b62f4` + final polish

---

## 1. Repository status

Stack: Next.js 16 App Router, Supabase (migrations **0001–0015**), Vitest.

| Area | Stato |
|---|---|
| Auth admin | Supabase Auth + `ADMIN_EMAIL` allowlist **or** `workspace_members` OWNER/ADMIN |
| Template engine | V1/V2 frozen visuals; **V3** `restaurant-premium-v3` = design family commerciale preferita per nuove demo restaurant |
| Demo / preview | `/demo/[slug]`; email OG preview viewport-style V3; owner CTA → `/interesse` + `OWNER_CONTACT_URL` |
| Enrichment | Google Place Details gated; email HTTP + **DNS SSRF** check |
| Campaigns | Bulk from Leads; template compatibility → `TEMPLATE_NOT_COMPATIBLE` |
| Jobs | Enrich → Demo → Message → Send; **FOLLOWUP_STEP** 0/3/7; **defer** for commercial waits |
| Review Queue | DB-backed + real `previewImageUrl` + bulk approve |
| Kill switch | `OUTREACH_PAUSED_ALL` → Send Guard defer (not FAILED) |
| Cron | Production: `/api/cron/jobs` + `vercel.json`; `/api/jobs/run` = admin manual only |
| Resend | Live adapter present; **MOCK** required |
| Kimi / Facebook | Out of scope |

---

## 2. Migrazioni

- **0001–0012:** storiche
- **0013:** commercial core Phase D
- **0014:** V2 `2.1.0` concept defaults (insert immutabile) + admin membership bootstrap
- **0015:** Restaurant Premium V3 template seed (insert immutabile; non riscrivere storia)

---

## 3. Restaurant Premium V3 (commercial freeze candidate)

- Mobile ATF: ribbon compatta + header overlay sopra hero
- Restaurant CTA: booking URL → `tel:` → `#contatti` (mai `#prenota` self-loop)
- Owner CTA: `/demo/[slug]/interesse` → log `OWNER_CTA_CLICKED` → redirect `OWNER_CONTACT_URL`
- Visual pack: template-owned vs lead-owned separati; pack attuale placeholder (location miste) — vedi `public/restaurant-premium-v3/assets/README.md`
- QA: `/demo/qa-v3`, screenshots in `docs/qa/`

---

## 4. Gap residui / go-live blockers

1. **Reply inbound** non affidabile → follow-up live bloccato finché non c’è sorgente inbound
2. **Resend LIVE** disabilitato (`RESEND_PROVIDER_MODE=mock`)
3. Webhook bounce/complaint/unsubscribe → suppression non certificato end-to-end
4. Production env: `CRON_SECRET` obbligatorio per worker autonomo; `OWNER_CONTACT_URL` obbligatorio per owner CTA
5. Visual pack V3: sostituire con pack fotografico coerente quando disponibile (non scaricare stock casuale)

---

## 5. Superficie pubblica vs protetta

| Pubblico | Protetto |
|---|---|
| `/`, `/login` | Dashboard |
| `/demo/*` (incl. email-preview, interesse) | `/api/*` (admin) |
| `/api/cron/*` (Bearer `CRON_SECRET`) | `/api/jobs/run` (admin manual) |

---

## 6. Test & build

Vedi `docs/TEST_REPORT.md`. Gate: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
