# Sales Automation OS

Internal commercial automation tool for Google Places discovery → qualification → demo → email outreach.

## Pipeline (Phase D.2)

`Google Places → Qualification → Contact Enrichment → Campaign → Demo (V2) → Email Preview → Review → Sequence 0/3/7 → Resend (mock)`

- **Public:** `/demo/[slug]` and `/demo/[slug]/email-preview` only
- **Admin:** dashboard + `/api/*` (session cookie; allowlist or workspace OWNER/ADMIN)
- **Production worker:** `GET|POST /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` (no admin cookie) — see `vercel.json` (`*/5 * * * *`)
- **Dev/admin manual flush:** `POST /api/jobs/run` (admin session only; not the production cron)
- **Outreach:** `RESEND_PROVIDER_MODE=mock` by default; kill switch `OUTREACH_PAUSED_ALL`

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Apply migrations **0001–0014** on Supabase (0014 = V2 concept defaults + admin membership bootstrap).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Vitest |
| `npx tsc --noEmit` | Typecheck |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Key env vars

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL` (allowlist) and/or workspace membership; `ADMIN_SESSION_SECRET` preferred in production
- `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_MODE=live|mock`
- `RESEND_PROVIDER_MODE=mock|live`, `RESEND_API_KEY` (live only — do not enable until authorized)
- `CRON_SECRET` for **`/api/cron/jobs`**
- `NEXT_PUBLIC_APP_URL` for demo/email preview URLs

## Docs

- `docs/MASTER_SPEC.md` — full specification
- `docs/CURRENT_STATE_AUDIT.md` — post Phase D.2 state
- `docs/decisions/001-kimi-role.md` — Kimi not in Google pipeline
- `docs/TEST_REPORT.md` — latest test results
