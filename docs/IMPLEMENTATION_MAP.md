# IMPLEMENTATION MAP — Sales Automation OS

**Riferimento:** `docs/MASTER_SPEC.md` v1.0 · `docs/CURRENT_STATE_AUDIT.md` (Phase 0 completata)
**Stato repo:** GREENFIELD — tutti i file elencati sono da creare ex-novo. Nessun duplicato possibile (§26, prima regola).
**Scopo:** mappa file-by-file dell'intera implementazione V1, organizzata per le fasi §23 (Phase 1 → Phase 10). Per ogni file: scopo, dipendenze dalla spec (§), fase.

> Questo documento è il "piano file-by-file prima delle modifiche principali" richiesto da §23.1. Nessun file va creato se non presente in questa mappa o senza aggiornare prima questa mappa.

---

## 0. Struttura del monorepo proposta

Una sola applicazione Next.js 15 (App Router) su Vercel che ospita **dashboard + demo runtime** (§10: "una sola applicazione Vercel per tutte le demo"), con Supabase come System of Record (§15, §24).

```
sales-automation-os/
├── package.json                  # dipendenze congelate §24
├── pnpm-lock.yaml
├── next.config.ts
├── tsconfig.json
├── middleware.ts                 # sessione Supabase + guard route
├── .env.example                  # tutte le env var, nessun secret reale §18
├── vitest.config.ts
├── playwright.config.ts
├── .github/workflows/ci.yml
├── app/
│   ├── (auth)/                   # login
│   ├── (dashboard)/              # area autenticata, AppShell §6.1
│   ├── (demo)/                   # route pubbliche demo §10 (noindex)
│   └── api/                      # route handlers sottili §17
├── components/                   # inventory UX §21
├── lib/
│   ├── domain/                   # Domain Services §15
│   ├── providers/                # adapter: google-places, resend, browser-worker, ai §14, §24
│   ├── jobs/                     # coda persistente §15.1
│   ├── supabase/                 # client server/browser/admin
│   ├── auth/                     # sessione + RBAC §16.4
│   └── types/                    # tipi DB generati + tipi dominio
├── supabase/
│   ├── config.toml
│   ├── migrations/               # 0001_* … 0010_* §16.3
│   └── seed.sql                  # seed §22.1
├── scripts/                      # seed, worker locale
├── tests/
│   ├── unit/  integration/  e2e/  security/  regression/   # §22.2
└── docs/                         # MASTER_SPEC, audit, mappe, README/ARCHITECTURE/DATABASE/OPERATIONS §22.3
```

**Convenzioni:**
- Route API sottili: validazione input (zod) + auth + chiamata a Domain Service (§17: "la logica vive nei Domain Services").
- Ogni adapter provider espone `interface.ts` + `mock.ts` + `live.ts` (+ factory `index.ts` guidata da env); mock mode obbligatorio (§22.3, §23.1).
- Migrazioni solo incrementali e in ordine numerico; mai reset DB (§16, §23.1). I nomi §16.3 sono adottati senza rinumerazione (audit Phase 0, §3).
- Nessuna feature fuori scope V1 (§2.2); niente backlog §25.

---

## 1. Fase per fase — file da creare

Legenda colonne: **File** (path proposto) · **Scopo** · **Spec** (sezioni di riferimento).

---

### PHASE 1 — Foundation
> Output §23: Next.js shell, Supabase migrations, auth/RLS, types.

#### Config & bootstrap

| File | Scopo | Spec |
|---|---|---|
| `package.json` | Dipendenze congelate: next 15, react, @supabase/supabase-js + ssr, zod, resend (server-only), vitest, playwright, tailwind | §24 |
| `next.config.ts` | Config Next 15; header `X-RobotsTag: noindex,nofollow` sulle route `/d/*` | §10, §18 |
| `tsconfig.json` | Strict mode; path alias `@/*` | §22.3 (no TS errors) |
| `middleware.ts` | Refresh sessione Supabase, protezione route `(dashboard)`, redirect login | §16.4 |
| `.env.example` | Elenco completo env var: Supabase URL/anon/service key, GOOGLE_PLACES_API_KEY, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, DEMO_BASE_URL, PROVIDER_MODE flags (mock/live), AI provider | §18, §6.2 |
| `.eslintrc.json` / `eslint.config.mjs` | Lint senza blocker | §22.3 |
| `vitest.config.ts`, `tests/setup.ts` | Base test unit/integration | §22.2 |

#### App shell & auth

| File | Scopo | Spec |
|---|---|---|
| `app/layout.tsx` | Root layout, font, globals | §6 |
| `app/globals.css` | Tema base (design token) | §21.1 |
| `app/page.tsx` | Redirect `/overview` o `/login` | §6.1 |
| `app/(auth)/login/page.tsx` | Login Supabase Auth (email/password o magic link) | §16.4 |
| `app/(dashboard)/layout.tsx` | Wrapper autenticato con AppShell | §6, §21 |
| `app/(dashboard)/loading.tsx`, `app/(dashboard)/error.tsx` | Stati di caricamento/errore con next action | §21.1 |

#### Supabase client & tipi

| File | Scopo | Spec |
|---|---|---|
| `lib/supabase/client.ts` | Browser client (anon key) | §16.4 |
| `lib/supabase/server.ts` | Server client per RSC/route handlers (cookie-based) | §16.4 |
| `lib/supabase/admin.ts` | Service role client — **solo server-side**, mai importato da componenti client | §16.4, §18 |
| `lib/types/database.types.ts` | Tipi generati da schema Supabase (`supabase gen types`) | §16 |
| `lib/types/domain.ts` | Enum e tipi dominio: `BusinessStatus`, `ProcessingStatus` (§3.1), `PolicyMode` (MANUAL/SCORE_BASED/FULL_AUTO), `JobStatus`, `JobType`, risultati adapter | §3.1, §4, §15.1 |

#### Auth, RBAC, HTTP helpers

| File | Scopo | Spec |
|---|---|---|
| `lib/auth/session.ts` | `getCurrentSession()`, `getCurrentWorkspace()` | §16.4 |
| `lib/auth/rbac.ts` | Ruoli Owner/Admin/Operator/Viewer e guard `requireRole()` | §16.4 |
| `lib/http/respond.ts` | Helper risposte API uniformi (ok/error con codice) | §17 |
| `lib/http/validate.ts` | Wrapper zod per body/query route handlers | §17 |
| `lib/errors.ts` | Errori dominio tipizzati (PolicyDenied, SendGuardBlocked, …) | §15 |
| `lib/env.ts` | Validazione env con zod a boot; fallimento esplicito se mancano var obbligatorie | §18 |

#### Componenti shell (inventory §21)

| File | Scopo | Spec |
|---|---|---|
| `components/app-shell/app-shell.tsx` | Sidebar + topbar + breadcrumbs + global search | §21 |
| `components/app-shell/sidebar-nav.tsx` | Voci navigazione §6.1 (Overview…Settings) | §6.1 |
| `components/app-shell/topbar.tsx` | Global search, workspace switcher, accesso kill switch sempre visibile | §21, §19.2 |
| `components/app-shell/breadcrumbs.tsx` | Breadcrumbs | §21 |

#### Database

| File | Scopo | Spec |
|---|---|---|
| `supabase/config.toml` | Config progetto locale Supabase | §16 |
| `supabase/migrations/0001_core_workspace_auth.sql` | `workspaces`, `workspace_members`, enums (business_status, processing_status, policy_mode, job_status, ruoli), RLS base workspace-scoped | §16.1, §16.3, §16.4 |

---

### PHASE 2 — Lead domain
> Output §23: Google adapter mock/live, leads, dedupe, segments. Gate: **mai invio** in questa fase (§3).

#### Migrazioni

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0002_leads_sources_contacts.sql` | `leads` (colonne §16.2, unique `(workspace_id, google_place_id)` parziale), `lead_contacts`, `lead_sources`, indici dedupe (normalized_domain/phone/email), RLS | §13.2, §16.2, §16.3 |

#### Provider Google Places

| File | Scopo | Spec |
|---|---|---|
| `lib/providers/google-places/interface.ts` | `GooglePlacesProvider`: `search()`, `getDetails()` — contratto indipendente da Google | §13, §24 |
| `lib/providers/google-places/types.ts` | Query model (categoria, area, raggio, max risultati, business status) e DTO normalizzati | §13.1 |
| `lib/providers/google-places/mock.ts` | Dataset fake deterministico per dev/test; nessuna call di rete | §22.3, §23.1 |
| `lib/providers/google-places/live.ts` | Implementazione Google Places API (two-step: campi minimi discovery / campi estesi enrichment) | §13.1 |
| `lib/providers/google-places/index.ts` | Factory `getGooglePlacesProvider()` guidata da env (`MOCK` se key assente) | §22.3, §23.1 |

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/leads.ts` | CRUD lead, aggregate detail, aggiornamento processing_status | §3.1, §16.2 |
| `lib/domain/normalize.ts` | Normalizzazione dominio/telefono/email/nome | §13.2 |
| `lib/domain/dedupe.ts` | Deduplica con ordine segnali: place_id → domain → phone → email → fuzzy (solo segnale, mai merge automatico) | §13.2 |
| `lib/domain/discovery.ts` | Orchestrazione discovery run: two-step, persistenza `google_place_id`, `google_last_enriched_at`, scrittura `lead_sources` | §13.1 |
| `lib/domain/segments.ts` | Segmenti salvati: definizione filtri, valutazione conteggio, campione anteprima | §5.3, §8.1 |
| `lib/jobs/inline-runner.ts` | **Runner sincrono temporaneo** per eseguire discovery/enrichment in-process finché la coda persistente non arriva in Phase 5. Da rimuovere in Phase 5. | §15 (nota transitoria) |

#### API routes (§17)

| File | Scopo | Spec |
|---|---|---|
| `app/api/discovery/runs/route.ts` | `POST` crea discovery run | §17, §13.1 |
| `app/api/leads/route.ts` | `GET` list/filter/paginate (filtri §5.3, ricerca §7.1) | §17, §7.1 |
| `app/api/leads/[id]/route.ts` | `GET` aggregate detail (dati + contatti + score + demo + campagne) | §17, §7.2 |
| `app/api/leads/[id]/enrich/route.ts` | `POST` enqueue/esegui enrichment | §17, §13.1 |

#### Pagine dashboard

| File | Scopo | Spec |
|---|---|---|
| `app/(dashboard)/overview/page.tsx` | KPI base (conteggi lead, pronti, bloccati), attività recenti, stato sistemi (placeholder fino a Phase 9) | §6, §6.1 |
| `app/(dashboard)/leads/page.tsx` | Lead list enterprise: tabella, filtri persistenti, saved views, bulk select | §7.1 |
| `app/(dashboard)/leads/[id]/page.tsx` | Lead detail con tab (Overview attivo; Audit/Demo/Messages/Timeline arrivano nelle fasi successive) | §7.2 |
| `app/(dashboard)/segments/page.tsx` | Segmenti salvati + creazione filtri | §6.1, §5.3 |

#### Componenti

| File | Scopo | Spec |
|---|---|---|
| `components/data-table/smart-data-table.tsx` | Tabella enterprise: colonne configurabili, filtri, saved views, bulk actions | §21, §7.1 |
| `components/data-table/saved-views.tsx` | Viste salvate | §7.1 |
| `components/leads/lead-filters.tsx` | Pannello filtri §5.3 | §5.3, §7.1 |
| `components/leads/bulk-actions-bar.tsx` | Azioni bulk con preview conteggio record | §7.1, §21.1 |
| `components/leads/lead-quick-drawer.tsx` | Quick preview drawer senza cambio pagina | §21, §7.1 |
| `components/leads/lead-status-badges.tsx` | Badge categoria/email/sito/business+processing status | §7.1, §3.1 |
| `components/empty-state.tsx` | Empty state con next action | §21, §21.1 |

---

### PHASE 3 — Scoring + policy
> Output §23: score engine, policy engine, snapshots. Il Policy Engine decide, non lo Score Engine (§5.2).

#### Migrazioni

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0003_audits_scores_segments.sql` | `website_audits` (audit versionato + score inputs), `lead_scores` (breakdown, algorithm_version, confidence), `tags`, `lead_tags`, `segments` | §16.1, §16.3, §5.1 |

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/scoring.ts` | Score composito 5 dimensioni (opportunity, contactability, data confidence, template match, business potential) 0-100; output spiegabile con breakdown + motivazioni + `algorithm_version` | §5.1 |
| `lib/domain/scoring-config.ts` | Pesi e soglie da configurazione workspace (DB), **mai hardcoded** | §5.2, §23.1 |
| `lib/domain/policy.ts` | Policy Engine: valutazione regole su score/confidence/valid_email/business_status; risoluzione policy workspace → campaign/category override; esito decisionale motivato | §4, §4.1, §5.2 |
| `lib/domain/policy-types.ts` | Tipi `PolicySet` (8 azioni configurabili §4.1), `PolicyDecision`, `PolicySnapshot` | §4.1 |
| `lib/domain/audit-inputs.ts` | Mapping risultato analisi sito → input scoring (issues/opportunities) | §5.1, §14.1 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/leads/[id]/score/route.ts` | `POST` recompute score (salva nuova riga `lead_scores` versionata) | §17, §5.1 |
| `app/api/leads/[id]/analyze/route.ts` | `POST` enqueue website analysis (placeholder via inline-runner fino a Phase 5) | §17, §14 |

#### Componenti

| File | Scopo | Spec |
|---|---|---|
| `components/badges/score-badge.tsx` | Score + confidence + popover breakdown | §21, §5.1 |
| `components/badges/policy-badge.tsx` | Badge Manual / Score-Based / Full Auto | §21, §4 |
| `components/leads/score-breakdown-panel.tsx` | Breakdown 5 dimensioni + motivazioni + algorithm_version | §5.1 |
| `app/(dashboard)/leads/[id]/tabs/audit-tab.tsx` | Tab Audit: evidenze, problemi, opportunità | §7.2 |

---

### PHASE 4 — Template + demo
> Output §23: template registry, versions, demo routes/editor. L'AI personalizza i dati, non il layout (§9).

#### Migrazioni

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0004_templates_demos.sql` | `website_templates`, `website_template_versions`, `demo_sites`, `demo_versions`, `demo_assets` (con provenance) | §9, §16.1, §16.3 |

#### Provider AI (contratto minimo V1)

| File | Scopo | Spec |
|---|---|---|
| `lib/providers/ai/interface.ts` | `AIProvider`: `personalizeDemoFields()`, `draftMessage()`, `rewriteSelection()` — output strutturato, mai layout | §9, §11.1, §24 |
| `lib/providers/ai/mock.ts` | Personalizzazioni deterministiche per test/seed | §22.3, §23.1 |
| `lib/providers/ai/index.ts` | Factory env-driven (live adapter documentato, attivabile post-V1) | §24 |

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/templates.ts` | Registry master template + versioni (schema, layout key, default content); immutabilità master | §9 |
| `lib/domain/demos.ts` | Ciclo vita demo: create → draft → publish version → restore → disable/expire; snapshot `demo_versions` | §9, §10 |
| `lib/domain/demo-assets.ts` | Asset manager con provenance; upload Supabase Storage | §9.2, §10 |
| `lib/demo/slug.ts` | Slug leggibile + short-id non enumerabile | §10 |
| `lib/templates/renderer.tsx` | Rendering server-side template versionato dai campi §9.1 | §9.1 |
| `lib/templates/variables.ts` | Risoluzione variabili/token per template e messaggi | §9.1, §11 |
| `lib/storage/buckets.ts` | Helper bucket Supabase Storage (asset, screenshot) | §10, §6.2 |

#### Route pubbliche demo

| File | Scopo | Spec |
|---|---|---|
| `app/(demo)/d/[slug]/page.tsx` | Demo pubblica renderizzata da `demo_versions` pubblicata; `noindex,nofollow`; 410 se disattivata/scaduta | §10, §18 |
| `app/(demo)/d/[slug]/not-found.tsx` | 404 senza leak di esistenza | §10 |
| `app/(demo)/layout.tsx` | Layout minimo pubblico, meta robots | §10 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/demos/route.ts` | `POST` create demo instance da lead + template | §17, §9 |
| `app/api/demos/[id]/route.ts` | `PATCH` update editable data (save draft) | §17, §9.2 |
| `app/api/demos/[id]/publish/route.ts` | `POST` publish version + invalidazione cache | §17, §10 |

#### Pagine & componenti

| File | Scopo | Spec |
|---|---|---|
| `app/(dashboard)/templates/page.tsx` | Lista landing + message template, versioni | §6.1, §9 |
| `app/(dashboard)/demos/page.tsx` | Istanze demo: preview, screenshot, stato | §6.1 |
| `app/(dashboard)/demos/[id]/edit/page.tsx` | Editor demo: sidebar edit + preview live | §9.2 |
| `components/demo/demo-preview.tsx` | Preview live Desktop/Mobile + open public URL + copy URL | §21, §7.3 |
| `components/demo/demo-editor-sidebar.tsx` | Edit campi §9.1, visibility toggle, regenerate selected field (AI) | §9.2 |
| `components/demo/version-history.tsx` | Save Draft / Publish / Restore Previous Version | §9.2 |
| `components/demo/asset-manager.tsx` | Upload/selezione asset con provenance | §9.2 |
| `app/(dashboard)/leads/[id]/tabs/demo-tab.tsx` | Tab Demo nel lead detail | §7.2 |

---

### PHASE 5 — Jobs + browser contract
> Output §23: queue, leases, BrowserWorkerProvider. Niente catene Google→Kimi→AI→demo→screenshot→Resend in una HTTP request (§15).

#### Migrazioni

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0007_automation_jobs.sql` | `automation_jobs` (tutti i campi §15.1, `idempotency_key` UNIQUE), `automation_job_events`, funzioni SQL per lease/claim atomici (`FOR UPDATE SKIP LOCKED`) | §15.1, §16.3 |

#### Job Orchestrator

| File | Scopo | Spec |
|---|---|---|
| `lib/jobs/types.ts` | `JobType` (DISCOVERY_RUN, ENRICH_LEAD, ANALYZE_WEBSITE, GENERATE_DEMO, SCREENSHOT_DESKTOP, SCREENSHOT_MOBILE, GENERATE_MESSAGE, SEND_MESSAGE, FOLLOWUP_STEP), payload e result tipizzati | §15.1, §10.1 |
| `lib/jobs/queue.ts` | `enqueue()` (con idempotency key), `claim()` (lease atomico), `complete()`, `fail()` (retry + backoff), `cancel()` | §15, §15.1 |
| `lib/jobs/handlers/index.ts` | Registry handler per job_type | §15 |
| `lib/jobs/handlers/discovery-run.ts` | Handler discovery two-step | §13.1 |
| `lib/jobs/handlers/enrich-lead.ts` | Handler enrichment | §13.1 |
| `lib/jobs/handlers/analyze-website.ts` | Handler analisi sito via BrowserWorkerProvider; salva `website_audits` versionato | §14, §14.1 |
| `lib/jobs/handlers/generate-demo.ts` | Handler generazione demo da template | §9 |
| `lib/jobs/handlers/screenshot.ts` | Pipeline screenshot desktop→mobile→upload Storage→update `demo_assets`/`campaign_lead`; retry con backoff; blocco invii dipendenti su fallimento | §10.1 |
| `lib/jobs/worker-loop.ts` | Loop worker: claim batch → execute → complete/fail; rispetto kill switch | §15, §19.2 |
| `app/api/cron/worker/route.ts` | Trigger schedulato (Vercel Cron) del worker loop | §15 |
| `scripts/worker.ts` | Worker locale standalone per dev/test | §15 |
| — rimozione `lib/jobs/inline-runner.ts` | Sostituito dalla coda persistente | §15 |

#### Provider Browser Worker (Kimi Work + WebBridge)

| File | Scopo | Spec |
|---|---|---|
| `lib/providers/browser-worker/interface.ts` | `BrowserWorkerProvider`: `analyze(url)`, `screenshot(url, viewport)` — sostituibile con Playwright post-V1 | §14, §25 |
| `lib/providers/browser-worker/types.ts` | Result contract normalizzato §14.1: final URL, redirect chain, email/telefoni/social/CTA/pagine, segnali responsive, `issues[]` (type/severity/evidence/confidence), `opportunities[]`, riferimenti evidenze | §14.1 |
| `lib/providers/browser-worker/mock.ts` | Risposte contratto-conformi deterministiche | §22.3, §23.1 |
| `lib/providers/browser-worker/kimi-webbridge.ts` | Adapter Kimi Work/WebBridge: job assegnati dal backend, stato ufficiale in Supabase, timeout + retry, nessuno stato nascosto in sessione | §14, §24 |
| `lib/providers/browser-worker/index.ts` | Factory env-driven | §23.1 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/jobs/claim/route.ts` | `POST` worker claim/lease (auth worker token) | §17, §15.1 |
| `app/api/jobs/[id]/complete/route.ts` | `POST` worker result (JSON normalizzato + evidenze + error code) | §17, §14 |
| `app/api/jobs/[id]/fail/route.ts` | `POST` worker error (error_code + retry policy) | §17, §14 |
| `app/api/demos/[id]/screenshots/route.ts` | `POST` enqueue SCREENSHOT_DESKTOP/MOBILE (gate: demo PUBLISHED) | §17, §10.1 |

---

### PHASE 6 — Messaging
> Output §23: draft editor, Resend adapter, Send Guard, events. **Mai auto-send senza Send Guard + suppression + kill switch** (§23.1).

#### Migrazioni (ordine numerico obbligatorio)

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0005_campaigns_policies.sql` | `campaigns`, `campaign_leads` (membership, state, **policy_snapshot** JSONB), `campaign_policy_versions` (immutabili), `followup_sequences`, `followup_sequence_versions`. Schema creato qui per rispettare l'ordine numerico §16.3; la UI campagne arriva in Phase 7. | §16.1, §16.3, §4.1 |
| `supabase/migrations/0006_messaging.sql` | `message_templates`, `message_template_versions`, `message_drafts`, `message_threads`, `messages` (snapshot immutabili), `message_events`, `suppression_list` | §16.1, §16.3, §11, §12 |

#### Provider Resend

| File | Scopo | Spec |
|---|---|---|
| `lib/providers/resend/interface.ts` | `EmailProvider`: `send()`, `sendTest()`; mai esposto al client | §11.2 |
| `lib/providers/resend/mock.ts` | Mock/test mode: registra invii finti, simula eventi webhook | §22.3, §23.1 |
| `lib/providers/resend/live.ts` | Integrazione Resend server-side (API key solo env server) | §11.2, §18 |
| `lib/providers/resend/index.ts` | Factory env-driven | §23.1 |

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/messaging.ts` | Livelli §11: master template versionato → personalized draft (snapshot variabili risolte) → manual override (non tocca il master) → sent message (snapshot immutabile) | §11 |
| `lib/send-guard.ts` | **Send Guard** server-side: 7 check (recipient, lead, campaign, policy snapshot, message, demo/screenshot READY, idempotency per campaign_lead+sequence_step). Unico punto di emissione invii. | §11.2 |
| `lib/domain/suppression.ts` | Hard bounce, unsubscribe, stop request → suppression globale per indirizzo; check pre-send | §12.2, §18 |
| `lib/domain/message-events.ts` | Persistenza eventi delivery/open/click/bounce con idempotenza evento | §17, §18 |
| `lib/webhooks/resend-verify.ts` | Verifica firma webhook Resend + dedupe event_id | §18 |
| `lib/jobs/handlers/generate-message.ts` | Handler generazione bozza da template + AI | §11, §15 |
| `lib/jobs/handlers/send-message.ts` | Handler invio: Send Guard → adapter → snapshot sent → eventi | §11.2, §15 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/messages/drafts/[id]/test/route.ts` | `POST` send test to owner | §17, §11.1 |
| `app/api/messages/drafts/[id]/approve/route.ts` | `POST` approve draft | §17, §11.1 |
| `app/api/messages/[id]/send/route.ts` | `POST` guarded send (Send Guard obbligatorio) | §17, §11.2 |
| `app/api/webhooks/resend/route.ts` | `POST` event/inbound handler: firma + idempotenza + suppression su bounce/unsubscribe | §17, §18, §12.2 |

#### Componenti

| File | Scopo | Spec |
|---|---|---|
| `components/messages/message-editor.tsx` | Subject + editor, Save Draft, Send Test, Approve & Schedule/Send, indicazione policy corrente | §11.1 |
| `components/messages/message-preview.tsx` | Preview destinatario con variabili risolte + screenshot demo + demo URL/CTA | §21, §11.1, §7.3 |
| `components/messages/token-picker.tsx` | Token/variable picker | §11.1 |
| `components/messages/ai-actions.tsx` | Rewrite / Shorten / Change tone / Regenerate paragraph | §11.1 |
| `app/(dashboard)/leads/[id]/tabs/messages-tab.tsx` | Tab Messages: draft, editor, preview, storico inviati | §7.2 |

---

### PHASE 7 — Campaign + review
> Output §23: wizard, Review Queue, bulk controls. Safe-by-default: nuove campagne Manual o Score-Based (§1, §6.2).

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/campaigns.ts` | Creazione campagna (segmento/filtri → conteggio + campione → template → sequence → modalità → soglie/rate limit/finestra/limite giornaliero), attivazione con validazione, simulazione effetti pre-attivazione | §8.1 |
| `lib/domain/campaign-materialization.ts` | Materializzazione `campaign_leads` con **policy snapshot** immutabile per lead | §4.1, §8.1 |
| `lib/domain/review-queue.ts` | Query coda review + decisioni (Approve/Edit/Skip/Reject/Pause Lead), bulk approve con conferma esplicita e conteggio | §8.2 |
| `lib/domain/rate-limit.ts` | Rate limit per workspace/campaign/provider; finestra oraria e limite giornaliero | §8.1, §18 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/campaigns/route.ts` | `POST` create campaign (+ `GET` list) | §17, §8.1 |
| `app/api/campaigns/[id]/activate/route.ts` | `POST` activate with validation; conferma esplicita per Full Auto/bulk | §17, §8.1 |
| `app/api/campaigns/[id]/pause/route.ts` | `POST` pause campaign (kill switch campagna) | §19.2 |
| `app/api/campaigns/[id]/simulate/route.ts` | `POST` simulazione effetti (conteggi per esito policy) prima dell'attivazione | §8.1 |
| `app/api/review-queue/route.ts` | `GET` card da validare (filtri per campagna/modalità) | §8.2 |
| `app/api/review-queue/decisions/route.ts` | `POST` decisioni singole e bulk (con `confirm_count` obbligatorio per bulk) | §8.2 |

#### Pagine & componenti

| File | Scopo | Spec |
|---|---|---|
| `app/(dashboard)/campaigns/page.tsx` | Lista campagne: stato, risultati, policy badge | §6.1 |
| `app/(dashboard)/campaigns/new/page.tsx` | Wizard 9 step §8.1 | §8.1 |
| `app/(dashboard)/campaigns/[id]/page.tsx` | Dettaglio campagna: configurazione, risultati, lead | §8.1 |
| `app/(dashboard)/review/page.tsx` | Review Queue | §6.1, §8.2 |
| `components/campaigns/campaign-wizard.tsx` | Stepper: segmento→anteprima→template→messaggio→follow-up→modalità→soglie/limits→simulazione→conferma | §8.1 |
| `components/campaigns/policy-configurator.tsx` | Configurazione granulare 8 azioni + soglie score/confidence; Full Auto mai pre-selezionato | §4.1, §6.2 |
| `components/review/review-card.tsx` | Card: azienda/categoria/città, score+confidence, thumbnail demo, oggetto+preview, segnali chiave, azioni | §21, §8.2 |
| `components/review/bulk-approve-bar.tsx` | Bulk approve solo con conferma esplicita + conteggio record | §8.2 |
| `components/modals/danger-zone-modal.tsx` | Conferma doppia per Full Auto, bulk send, delete, kill switch | §21, §8.1 |

---

### PHASE 8 — Inbox + follow-up
> Output §23: threads, inbound, cancellation. Nessun auto-send delle reply in V1 (§12.1).

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/inbox.ts` | Thread per lead/campagna, filtri (unread/interested/needs reply/automated/archived), risposta dalla dashboard (via Send Guard, nessun auto-send) | §12.1 |
| `lib/domain/followups.ts` | Sequenze: enqueue step successivo se eleggibile dopo N giorni; **cancel atomico** di tutti i follow-up pendenti su reply; stop su bounce/unsubscribe/pause | §12.2 |
| `lib/jobs/handlers/followup-step.ts` | Handler step follow-up: re-check eleggibilità → Send Guard → send | §12.2, §11.2 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/inbox/threads/route.ts` | `GET` thread list con filtri | §12.1 |
| `app/api/inbox/threads/[id]/route.ts` | `GET` dettaglio thread (lead + demo + timeline collegati) | §12.1 |
| `app/api/inbox/threads/[id]/reply/route.ts` | `POST` risposta owner (manuale, guardata) | §12.1 |
| `app/api/inbox/threads/[id]/actions/route.ts` | `POST` mark read/archive/tag interested | §12.1 |

#### Pagine & componenti

| File | Scopo | Spec |
|---|---|---|
| `app/(dashboard)/inbox/page.tsx` | Inbox con filtri | §6.1, §12.1 |
| `app/(dashboard)/inbox/[threadId]/page.tsx` | Conversazione + link lead/demo/timeline + AI summary/suggested reply (opzionale, mai auto-send) | §12.1 |
| `app/(dashboard)/automations/page.tsx` | Policy attive, follow-up sequence, job status/code | §6.1 |
| `components/inbox/thread-list.tsx` | Lista thread con badge filtri | §12.1 |
| `components/inbox/reply-composer.tsx` | Composer risposta manuale | §12.1 |
| `components/automations/job-status-table.tsx` | Stato job, retry, errori | §15, §6.1 |
| `app/(dashboard)/leads/[id]/tabs/timeline-tab.tsx` | Tab Timeline: eventi business + tecnici | §7.2, §21 |

---

### PHASE 9 — Analytics + operations
> Output §23: KPI, health, audit, kill switch. Kill switch globale sempre raggiungibile dalla dashboard (§19.2).

#### Migrazioni

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0008_activity_audit.sql` | `activity_log` append-only (timeline + Decision Trace); revoke update/delete ordinari | §16.1, §16.3, §16.4, §19.1 |
| `supabase/migrations/0009_provider_settings.sql` | `provider_connections` (stato provider + metadata), feature flags, kill switch state per workspace | §16.3, §19.2, §6.2 |

#### Domain Services

| File | Scopo | Spec |
|---|---|---|
| `lib/domain/activity.ts` | Scrittura append-only eventi timeline/Decision Trace dal domain layer | §16.4, §19.1 |
| `lib/domain/decision-trace.ts` | Ricostruzione per ogni invio: source, dati, audit version, score breakdown + algorithm version, policy version + condizioni, demo/template/version, message version, Send Guard result, provider message ID, webhook events | §19.1 |
| `lib/domain/analytics.ts` | KPI funnel §20: discovery, qualification, demo, outreach, engagement, commercial, optimization; drill-down categoria→campagna→template→score band | §20 |
| `lib/kill-switch.ts` | PAUSE ALL OUTREACH, Pause Campaign/Discovery/Browser Workers, Disable Provider; lettura fail-closed nel send path | §19.2 |
| `lib/health.ts` | Health check provider (Google, Resend, Browser Worker, Storage) | §21 (Provider Status), §6.2 |
| `lib/domain/retention.ts` | Retention configurabile lead non utilizzati/audit (job di pulizia) | §18 |

#### API routes

| File | Scopo | Spec |
|---|---|---|
| `app/api/analytics/overview/route.ts` | `GET` KPI funnel aggregati | §20 |
| `app/api/analytics/drilldown/route.ts` | `GET` drill-down categoria→campagna→template→score band | §20 |
| `app/api/health/providers/route.ts` | `GET` stato provider e configurazione | §21, §6.2 |
| `app/api/settings/providers/route.ts` | `GET`/`POST` connessioni provider (mai secret al client; solo stato/last4) | §6.2, §18 |
| `app/api/settings/kill-switch/route.ts` | `POST` attiva/disattiva kill switch (Danger Zone + audit) | §19.2 |
| `app/api/onboarding/status/route.ts` | `GET` checklist onboarding verde/ambra/rosso | §6.2 |

#### Pagine & componenti

| File | Scopo | Spec |
|---|---|---|
| `app/(dashboard)/analytics/page.tsx` | Dashboard KPI con drill-down | §6.1, §20 |
| `app/(dashboard)/settings/page.tsx` | Hub impostazioni | §6.1 |
| `app/(dashboard)/settings/providers/page.tsx` | Provider, domini, API; verifica credenziali | §6.1, §6.2, §18 |
| `app/(dashboard)/settings/team/page.tsx` | Utenti e ruoli | §16.4 |
| `app/(dashboard)/settings/security/page.tsx` | Kill switch, retention, sicurezza | §18, §19.2 |
| `app/(dashboard)/onboarding/page.tsx` | Wizard 10 step §6.2 (Full Auto **non** pre-selezionato allo step 6) | §6.2 |
| `app/(dashboard)/onboarding/checklist.tsx` | Checklist finale verde/ambra/rosso con link correttivi | §6.2 (step 10) |
| `components/kpi-card.tsx` | KPI con trend e drilldown | §21 |
| `components/provider-status.tsx` | Health/configurazione provider | §21 |
| `components/decision-trace.tsx` | Vista "perché il sistema ha agito" | §21, §19.1 |
| `components/timeline.tsx` | Timeline eventi business + tecnici | §21 |
| `components/kill-switch-banner.tsx` | Banner/azione kill switch globale sempre raggiungibile | §19.2, §21.1 |

---

### PHASE 10 — QA + hardening
> Output §23: E2E, security, docs, performance.

#### Seed

| File | Scopo | Spec |
|---|---|---|
| `supabase/migrations/0010_seed_baseline.sql` | Categorie base e dati non-production ripetibili via migrazione | §16.3, §22.1 |
| `supabase/seed.sql` + `scripts/seed.ts` | Seed completo §22.1: 5 categorie demo, 2 landing template per categoria prioritaria, 2 message template + 1 follow-up sequence, 20 lead fake realistici con score/stati diversi, eventi email fake per Inbox/Analytics. **Nessun dato reale o secret.** | §22.1, §23.1 |

#### Test (§22.2)

| File | Scopo | Spec |
|---|---|---|
| `tests/unit/scoring.test.ts` | 5 dimensioni, breakdown, algorithm_version, spiegabilità | §22.2, §5.1 |
| `tests/unit/policy.test.ts` | Valutazione Manual/Score-Based/Full Auto, override gerarchia, snapshot | §22.2, §4.1 |
| `tests/unit/send-guard.test.ts` | I 7 check §11.2, blocco suppression, idempotenza | §22.2, §11.2 |
| `tests/unit/dedupe.test.ts` | Ordine segnali §13.2, fuzzy mai merge automatico | §22.2, §13.2 |
| `tests/unit/template-variables.test.ts` | Risoluzione variabili/template | §22.2, §9.1, §11 |
| `tests/unit/kill-switch.test.ts` | Kill switch blocca send path (fail-closed) | §19.2, §22.3 |
| `tests/integration/repositories.test.ts` | Repository Supabase reali (DB locale) | §22.2 |
| `tests/integration/job-lifecycle.test.ts` | enqueue→claim→complete/fail→retry, lease atomici, idempotency_key | §22.2, §15.1 |
| `tests/integration/webhook-idempotency.test.ts` | Webhook Resend: firma, dedupe evento, suppression | §22.2, §18 |
| `tests/e2e/onboarding.spec.ts` | Wizard onboarding completo | §22.2, §6.2 |
| `tests/e2e/discovery-fake.spec.ts` | Discovery con mock provider | §22.2 |
| `tests/e2e/lead-preview.spec.ts` | Lead detail + preview demo/messaggio | §22.2, §7.3 |
| `tests/e2e/campaign-creation.spec.ts` | Wizard campagna + simulazione | §22.2, §8.1 |
| `tests/e2e/manual-approval.spec.ts` | Flusso Manual: approve → send (mock) | §22.2, §4 |
| `tests/e2e/full-auto-dry-run.spec.ts` | Full Auto dry run senza email reali | §22.2, §23.1 |
| `tests/security/rls.test.ts` | RLS: isolamento workspace, ruoli | §22.2, §16.4 |
| `tests/security/secret-exposure.test.ts` | Nessun secret in bundle client/risposte API | §22.2, §18 |
| `tests/security/workspace-access.test.ts` | Accesso cross-workspace negato | §22.2, §16.4 |
| `tests/regression/demo-rendering.spec.ts` | Rendering template desktop/mobile (screenshot diff) | §22.2 |
| `tests/regression/message-preview.spec.ts` | Preview messaggio stabile | §22.2 |

#### Docs & CI

| File | Scopo | Spec |
|---|---|---|
| `README.md` | Fresh clone → install → migrations → seed → run | §22.3 |
| `docs/ARCHITECTURE.md` | Layer §15, adapter §14/§24, job model §15.1 | §22.3 |
| `docs/DATABASE.md` | Schema, migrazioni, RLS | §22.3, §16 |
| `docs/OPERATIONS.md` | Runbook: kill switch, provider, retry, incidenti | §22.3, §19 |
| `playwright.config.ts` | Config E2E (baseURL, progetti desktop/mobile) | §22.2 |
| `.github/workflows/ci.yml` | Lint, typecheck, unit, integration, E2E (mock), migrations check | §22.3 |

---

## 2. Riepilogo migrazioni (§16.3, nomi adottati senza rinumerazione — vedi audit §3)

| Migration | Contenuto | Fase che la crea |
|---|---|---|
| `0001_core_workspace_auth` | workspaces, members, enums, RLS base | 1 |
| `0002_leads_sources_contacts` | leads, contacts, sources, dedupe indexes | 2 |
| `0003_audits_scores_segments` | website_audits, lead_scores, tags, segments | 3 |
| `0004_templates_demos` | template/version, demo/version/assets | 4 |
| `0005_campaigns_policies` | campaigns, campaign_leads (policy snapshot), policy versions, followup sequences | 6 (creata prima di 0006 per ordine numerico; UI in fase 7) |
| `0006_messaging` | templates, drafts, threads, messages, events, suppression | 6 |
| `0007_automation_jobs` | jobs, job events, leases, idempotency | 5 |
| `0008_activity_audit` | activity log / decision trace append-only | 9 |
| `0009_provider_settings` | provider connection metadata, feature flags, kill switch | 9 |
| `0010_seed_baseline` | categorie/template/test data non-production | 10 |

> Nota di sequenza: Phase 5 crea `0007` dopo che `0004` esiste; `0005`/`0006` sono create insieme in Phase 6. L'ordine numerico dei file è sempre rispettato all'atto dell'applicazione; in caso di sviluppo parallelo, chi crea una migrazione verifica `supabase/migrations/` e numera senza collisioni (§16.3).

## 3. Copertura endpoint §17

Tutti i 19 endpoint §17 sono mappati 1:1 su route file sopra elencate; gli endpoint aggiuntivi (pause campagna, simulate, review queue, inbox, analytics, health, settings, kill switch, onboarding, cron worker) derivano esplicitamente da §8.1, §8.2, §12.1, §19.2, §20, §6.2 e non introducono feature fuori scope.

## 4. Copertura component inventory §21

Tutti i 14 componenti §21 sono mappati: AppShell, KPI Card, Smart Data Table, Score Badge, Policy Badge, Lead Quick Drawer, Demo Preview, Message Preview, Review Card, Timeline, Decision Trace, Provider Status, Empty State, Danger Zone Modal.

## 5. Invarianti trasversali da rispettare in ogni file

- **Mai invio** durante discovery/enrichment/analysis/scoring (§3) — nessuna route di queste fasi importa l'EmailProvider.
- **Send Guard unico punto di emissione** (§11.2) — ogni send passa da `lib/send-guard.ts`.
- **Policy snapshot** su campaign_lead/job (§4.1) — mai rivalutare retroattivamente.
- **Versioning** preservato per template, demo, messaggi, policy (§23.1).
- **Mock/test mode** per ogni adapter esterno (§22.3, §23.1).
- **Nessun hardcode** di provider IDs, domini, soglie (§23.1) — tutto da `lib/env.ts` / configurazione workspace.
- **RLS** su ogni tabella tenant-owned; service role solo server (§16.4).
