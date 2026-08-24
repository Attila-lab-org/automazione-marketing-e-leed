# Sales Automation OS

Internal commercial automation tool for Google Places discovery → qualification → demo → email outreach.

## Pipeline (Phase D)

`Google Places → Qualification → Contact Enrichment → Campaign → Demo (V2) → Email Preview → Review → Sequence → Resend (mock)`

- **Public:** `/demo/[slug]` and `/demo/[slug]/email-preview` only
- **Admin:** dashboard + all `/api/*` (session cookie auth)
- **Outreach:** `RESEND_PROVIDER_MODE=mock` by default; kill switch `OUTREACH_PAUSED_ALL` persisted in DB

## Setup

```bash
npm install
cp .env.example .env.local   # configure Supabase + ADMIN_EMAIL/PASSWORD + optional Google/Resend
npm run dev
```

Login at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Apply migrations `0001`–`0013` on Supabase (includes Restaurant Premium V2, default sequence/message seeds).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Vitest (109 tests) |
| `npx tsc --noEmit` | Typecheck |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Key env vars

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
- `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_MODE=live|mock`
- `RESEND_PROVIDER_MODE=mock|live`, `RESEND_API_KEY` (live only)
- `CRON_SECRET` for `/api/jobs/run` batch worker
- `NEXT_PUBLIC_APP_URL` for demo/email preview URLs

## Docs

- `docs/MASTER_SPEC.md` — full specification
- `docs/CURRENT_STATE_AUDIT.md` — post Phase D state
- `docs/decisions/001-kimi-role.md` — Kimi not in Google pipeline
- `docs/TEST_REPORT.md` — latest test results
