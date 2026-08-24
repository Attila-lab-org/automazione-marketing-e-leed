# CURRENT STATE AUDIT — Sales Automation OS

**Data audit:** Phase D.2 (Final reliability) — 2026-08-24  
**Baseline commit:** Phase D.1 `c194945` + D.2 defer/SSRF/preview/cron docs

---

## 1. Repository status

Stack: Next.js 16 App Router, Supabase (migrations **0001–0014**), Vitest.

| Area | Stato Phase D.2 |
|---|---|
| Auth admin | Supabase Auth + `ADMIN_EMAIL` allowlist **or** `workspace_members` OWNER/ADMIN |
| Template engine | V1 frozen; V2 `restaurant-premium-v2` with concept defaults + template assets |
| Demo / preview | `/demo/[slug]`; email OG preview allineata al first viewport V2 |
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

---

## 3. Gap residui / go-live blockers

1. **Reply inbound** non affidabile → follow-up live bloccato finché non c’è sorgente inbound
2. **Resend LIVE** disabilitato (`RESEND_PROVIDER_MODE=mock`)
3. Webhook bounce/complaint/unsubscribe → suppression non certificato end-to-end
4. Production env: `CRON_SECRET` obbligatorio per worker autonomo

---

## 4. Superficie pubblica vs protetta

| Pubblico | Protetto |
|---|---|
| `/`, `/login` | Dashboard |
| `/demo/*` | `/api/*` (admin) |
| `/api/cron/*` (Bearer `CRON_SECRET`) | `/api/jobs/run` (admin manual) |

---

## 5. Test & build

Vedi `docs/TEST_REPORT.md` (eseguiti in D.2).
