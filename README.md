# Sales Automation OS

Internal commercial automation tool for Google Places discovery → qualification → demo → email outreach.

## Pipeline

`Google Places → Qualification → Contact Enrichment → Campaign → Demo (Restaurant Premium V3) → Email Preview → Review → Sequence 0/3/7 → Resend (mock)`

- **Public:** `/demo/[slug]`, `/demo/[slug]/email-preview`, `/demo/[slug]/interesse` (owner CTA → `OWNER_CONTACT_URL`)
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

Apply migrations **0001–0015** on Supabase (0015 = Restaurant Premium V3).

Restaurant demos nuove usano **Restaurant Premium V3** (`restaurant-premium-v3`); V1/V2 restano immutati.
QA visuale: `/demo/qa-v3` e `/demo/qa-v3/email-preview`.

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
- `GOOGLE_PLACES_PROVIDER_MODE=live|mock`, `GOOGLE_PLACES_API_KEY` (live only)
- `RESEND_PROVIDER_MODE=mock|live`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET` (live only — do not enable until authorized)
- `RESEND_TEST_RECIPIENT_ALLOWLIST` — exact emails allowed as Campaign TEST delivery targets (server-side; no fallback to lead)
- `CRON_SECRET` for **`/api/cron/jobs`**
- `NEXT_PUBLIC_APP_URL` for demo/email preview URLs
- `OWNER_CONTACT_URL` — http(s) destinazione commerciale (`?channel=site`). Se mancante: nessun redirect arbitrario
- `OWNER_WHATSAPP` — numero internazionale o URL `wa.me` (`?channel=whatsapp`). Se mancante: i clienti scrivono ad Attila (`393462689082`)
- `OWNER_OFFER_PRICE` — opzionale (es. `350€`); se vuoto nessun prezzo in demo/WhatsApp
- `OWNER_SHOW_BRIDGE` — opzionale; mid-page OwnerBridge default **OFF**

Settings → Config commerciale mostra READY / MISSING senza esporre i valori.
## Deploy canonico

| | Valore |
|---|---|
| GitHub | `Attila-lab-org/automazione-marketing-e-leed` (`main`) |
| Vercel team | **Lorattiggio** |
| Vercel project | `automazione-marketing-e-leed-o1wt` |
| Production URL | https://automazione-marketing-e-leed-o1wt.vercel.app |

Non usare il vecchio progetto Hobby **GustaGo / sales-automation-os** (residuo di test).

## Docs

- `docs/MASTER_SPEC.md` — full specification
- `docs/CURRENT_STATE_AUDIT.md` — post V3 commercial polish state
- `docs/decisions/001-kimi-role.md` — Kimi not in Google pipeline
- `docs/TEST_REPORT.md` — latest test results
- `docs/qa/` — Restaurant Premium V3 visual screenshots
