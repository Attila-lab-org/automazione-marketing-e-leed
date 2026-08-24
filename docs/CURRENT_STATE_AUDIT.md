# CURRENT STATE AUDIT — Sales Automation OS

**Data audit:** Phase D (Commercial Core) — 2026-08-24  
**Baseline commit:** `1029980` (Phase C) + uncommitted Phase D slice

---

## 1. Repository status

Il repository **non è più greenfield**. Stack: Next.js 16 App Router, Supabase (migrations 0001–0013), Vitest.

| Area | Stato Phase D |
|---|---|
| Auth admin | Session cookie HMAC (`/login`, middleware dashboard, `withAdmin` su API interne) |
| Template engine | V1 congelato (`restaurant-premium`), V2 (`restaurant-premium-v2`) |
| Demo pubbliche | `/demo/[slug]` via `DemoRenderer`; email preview PNG `/demo/[slug]/email-preview` |
| Enrichment | Google on-demand (`google-enrich.ts`); email HTTP scrape (`email-from-website.ts`) |
| Campaigns | `campaigns`, `campaign_leads`, bulk create/prepare/approve API |
| Jobs | `SupabaseJobQueue` + handlers LEAD_ENRICHMENT → DEMO → MESSAGE → SEND |
| Review Queue | DB-backed (`/api/review-queue`), no fixture hardcoded |
| Kill switch | `workspace_feature_flags.OUTREACH_PAUSED_ALL` persistente + audit |
| Resend | Live adapter completo; produzione resta `mock` finché non autorizzato |
| Kimi / browser | **Non** in pipeline Google; decision doc mantenuto |

---

## 2. Migrazioni

- **0001–0012:** storiche, non modificare
- **0013_commercial_core_phase_d.sql:** V2 template version, visual email + sequence seeds, `campaign_leads.preparation`, fixture cleanup safe markers

---

## 3. Gap residui / go-live blockers

1. **Reply detection:** Resend outbound non ferma follow-up su reply senza inbound provider configurato — documentato come blocker go-live follow-up live
2. **Sequence FOLLOWUP_STEP jobs:** scheduling post-invio step 1/2 parzialmente predisposto, non full cron orchestration
3. **Supabase Auth multi-tenant:** V1 usa admin env session (owner tool), non SaaS
4. **Migration 0013:** applicare su production Supabase prima del deploy
5. **Cron:** configurare Vercel cron → `POST /api/jobs/run` con `CRON_SECRET`

---

## 4. Superficie pubblica vs protetta

| Pubblico | Protetto (admin session) |
|---|---|
| `/`, `/login` | `/overview`, `/leads`, `/campaigns`, … |
| `/demo/*` | Tutte le `/api/*` tranne `/api/auth/*` |

Service role **mai** esposto al client.

---

## 5. Test & build (2026-08-24)

- `npm test` — 109/109
- `npx tsc --noEmit` — OK
- `npm run lint` — 0 errori
- `npm run build` — OK
