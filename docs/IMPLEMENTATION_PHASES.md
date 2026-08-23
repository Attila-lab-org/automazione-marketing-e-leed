# IMPLEMENTATION PHASES — Sales Automation OS

**Riferimento:** `docs/MASTER_SPEC.md` v1.0 · `docs/IMPLEMENTATION_MAP.md` (mappa file-by-file) · `docs/CURRENT_STATE_AUDIT.md`
**Scopo:** piano di implementazione per fasi §23 con obiettivo, file principali, criteri di gate/accettazione, test richiesti e rischi residui per ogni fase. Include seed §22.1 e Definition of Done §22.3 come checklist finale.

---

## 0. Regole operative §23.1 — vincolanti per OGNI fase

Queste regole prevalgono su qualsiasi pressione di scadenza e vanno verificate a ogni chiusura di fase:

1. **Prima leggere repository e documentazione esistente.** Il repo è greenfield (audit Phase 0): la fonte di verità è MASTER_SPEC.md. Se emergono file nuovi, rileggere prima di modificare.
2. **Piano file-by-file prima delle modifiche principali.** IMPLEMENTATION_MAP.md è il piano; ogni deviazione aggiorna prima la mappa.
3. **Migrazioni incrementali; mai reset DB come scorciatoia.** Nomi §16.3 adottati senza rinumerazione (nessuna collisione, vedi audit §3). Ordine numerico sempre rispettato.
4. **Non cambiare stack senza motivazione tecnica documentata.** Stack congelato §24: Next.js 15 + Supabase + Vercel + Resend + Google Places + Kimi/WebBridge via adapter.
5. **Mai auto-send senza Send Guard + suppression + kill switch.** Send Guard (`lib/send-guard.ts`) è l'unico punto di emissione (§11.2).
6. **Non hardcodare provider IDs, domini o score thresholds.** Tutto da env/configurazione workspace (soglie in DB, §5.2).
7. **Non inviare email reali durante test/seed.** Resend in mock/test mode finché non esplicitamente promosso.
8. **Ogni adapter esterno ha mock/test mode.** Google Places, Resend, BrowserWorkerProvider, AI: `interface + mock + live + factory`.
9. **Preservare versioning** di template, demo, messaggi e policy. Policy snapshot immutabile su campaign_lead/job (§4.1).
10. **Chiudere ogni fase con test + report** dei file modificati e rischi residui (questo documento definisce per ogni fase gate e test minimi).

**Confini di scope V1 (§2.2), da NON implementare in nessuna fase:** page builder libero stile Webflow; CRM con fatturazione/contratti/customer success; ML proprietario (solo scoring deterministico + AI confidence); automazioni invasive social/direct; multi-tenant SaaS commerciale completo (schema workspace-ready, ma V1 opera con un solo workspace owner). Anche il backlog §25 è fuori V1.

---

## PHASE 0 — Audit repo / current state ✅ COMPLETATA

- **Output:** `docs/CURRENT_STATE_AUDIT.md` (nessuna modifica distruttiva).
- **Esito:** repo greenfield; baseline §24 congelata; invarianti §1 e regole §23.1 registrate; nomi migrazioni §16.3 adottabili senza rinumerazione.

---

## PHASE 1 — Foundation

**Obiettivo.** Applicazione Next.js 15 avviabile con auth Supabase, AppShell, tipi dominio, RLS base e migrazione 0001. Nessuna logica di business.

**File principali** (dettaglio in MAP §Phase 1):
- Config: `package.json`, `next.config.ts`, `tsconfig.json`, `middleware.ts`, `.env.example`, `lib/env.ts`.
- Shell: `app/(auth)/login/page.tsx`, `app/(dashboard)/layout.tsx`, `components/app-shell/*`.
- Supabase: `lib/supabase/{client,server,admin}.ts`, `lib/types/{database.types,domain}.ts`, `lib/auth/{session,rbac}.ts`.
- DB: `supabase/migrations/0001_core_workspace_auth.sql`, `supabase/config.toml`.

**Gate di chiusura (accettazione).**
- [ ] `pnpm install && pnpm dev` avvia l'app; login/logout funzionanti con Supabase Auth.
- [ ] Migrazione 0001 applicata in locale con `supabase db reset`/migrate su DB di sviluppo pulito (reset consentito SOLO pre-dati, mai come scorciatoia in seguito §23.1).
- [ ] RLS attiva su `workspaces`/`workspace_members`: utente senza membership non legge nulla.
- [ ] Route `(dashboard)` protette da middleware; service role mai importato in codice client.
- [ ] Typecheck e lint puliti.

**Test richiesti.**
- Unit: `lib/env.ts` (fallimento esplicito su var mancanti), RBAC guards.
- Security smoke: accesso anonimo a route dashboard → redirect.

**Rischi residui attesi.**
- Tipi `database.types.ts` da rigenerare a ogni migrazione (rischio disallineamento → mitigare con script `gen:types` in CI).
- AppShell con navigazione parzialmente "dead-end" finché le pagine delle fasi successive non esistono (accettabile; Empty State con next action §21.1).

---

## PHASE 2 — Lead domain

**Obiettivo.** Discovery lead via Google Places (mock di default, live opzionale), normalizzazione, deduplica, lista lead enterprise, segmenti. **Gate assoluto: mai invio (§3)** — nessun import di provider email.

**File principali** (MAP §Phase 2):
- Migrazione `0002_leads_sources_contacts.sql`.
- Provider: `lib/providers/google-places/{interface,types,mock,live,index}.ts`.
- Domain: `lib/domain/{leads,normalize,dedupe,discovery,segments}.ts`, `lib/jobs/inline-runner.ts` (transitorio).
- API: `app/api/discovery/runs/route.ts`, `app/api/leads/route.ts`, `app/api/leads/[id]/route.ts`, `app/api/leads/[id]/enrich/route.ts`.
- UI: `app/(dashboard)/{overview,leads,leads/[id],segments}/page.tsx`, `components/data-table/*`, `components/leads/*`, `components/empty-state.tsx`.

**Gate di chiusura.**
- [ ] Discovery run con mock provider popola `leads` + `lead_sources` con `google_place_id` e `google_last_enriched_at` (§13.1).
- [ ] Deduplica conforme all'ordine segnali §13.2; fuzzy match produce solo segnale, mai merge automatico.
- [ ] Unique parziale `(workspace_id, google_place_id)` verificata a livello DB (§16.2).
- [ ] Lead list con filtri §5.3, saved views, bulk select, quick drawer; ricerca per nome/dominio/email/telefono/città/place_id (§7.1).
- [ ] Two-step discovery/enrichment rispettato: enrichment richiede campi extra solo su candidati selezionati (§13.1).
- [ ] Live mode Google Places attivabile solo con API key in env; senza key il sistema resta in mock (§22.3).

**Test richiesti.**
- Unit: `dedupe.test.ts` (ordine segnali, no auto-merge fuzzy), `normalize.ts` (domini/telefoni/email edge case).
- Integration: repository leads su Supabase locale; vincolo unique; RLS su leads.
- E2E (preliminare): discovery fake da UI → lead visibili in lista.

**Rischi residui attesi.**
- `inline-runner.ts` è debito tecnico deliberato: esecuzione sincrona da sostituire in Phase 5; non deve mai superare timeout HTTP in live mode (mitigazione: solo mock fino a Phase 5 per flussi lunghi).
- Costi Google Places in live: two-step obbligatorio, max risultati configurabile (§13.1).

---

## PHASE 3 — Scoring + policy

**Obiettivo.** Score composito spiegabile e versionato; Policy Engine unico che traduce configurazioni runtime in decisioni; nessun ramo di codice per modalità (§1 Policy-driven).

**File principali** (MAP §Phase 3):
- Migrazione `0003_audits_scores_segments.sql`.
- Domain: `lib/domain/{scoring,scoring-config,policy,policy-types,audit-inputs}.ts`.
- API: `app/api/leads/[id]/score/route.ts`, `app/api/leads/[id]/analyze/route.ts` (placeholder fino a Phase 5).
- UI: Score/Policy badge, score breakdown panel, tab Audit.

**Gate di chiusura.**
- [ ] Score = 5 dimensioni §5.1 (0-100 ciascuna) con breakdown, confidence, motivazioni sintetiche, `algorithm_version` persistiti in `lead_scores` (append di nuove versioni, mai update distruttivo).
- [ ] Soglie e pesi da configurazione workspace, non hardcoded (§5.2, §23.1).
- [ ] Policy Engine valuta le 8 azioni §4.1 separatamente; risoluzione override workspace → campaign/category.
- [ ] Decisione Score-Based conforme alla regola §5.2 (es. opportunity ≥85, confidence ≥85, contactability ≥80, valid_email, business_status active) solo se configurata così — la regola è dato, non codice.
- [ ] Nessuna autorizzazione al send può derivare dallo Score Engine direttamente (§5.2).

**Test richiesti.**
- Unit: `scoring.test.ts` (determinismo, breakdown, version), `policy.test.ts` (3 modalità, override, motivazioni decisione).
- Integration: persistenza `lead_scores` versionata; RLS.

**Rischi residui attesi.**
- Senza dati audit reali (Phase 5), le dimensioni opportunity/template match lavorano su input parziali: confidence deve rifletterlo (no score "gonfiati").
- Rischio di soglie hardcoded "temporanee": vietato; code review checklist dedicata.

---

## PHASE 4 — Template + demo

**Obiettivo.** Template master versionati, istanze demo per lead con URL pubblico sicuro, editor demo completo §9.2. L'AI personalizza solo i dati, mai layout/CSS (§9).

**File principali** (MAP §Phase 4):
- Migrazione `0004_templates_demos.sql`.
- Provider AI: `lib/providers/ai/{interface,mock,index}.ts`.
- Domain: `lib/domain/{templates,demos,demo-assets}.ts`, `lib/demo/slug.ts`, `lib/templates/{renderer.tsx,variables.ts}`, `lib/storage/buckets.ts`.
- Route pubbliche: `app/(demo)/d/[slug]/page.tsx` (+ not-found, layout).
- API: `app/api/demos/route.ts`, `app/api/demos/[id]/route.ts`, `app/api/demos/[id]/publish/route.ts`.
- UI: pagine `templates/`, `demos/`, editor demo, componenti `components/demo/*`, tab Demo lead.

**Gate di chiusura.**
- [ ] Campi configurabili §9.1 completi (business_name, logo, palette, hero, about, services, highlights, gallery, contatti, social, CTA, visibility toggle).
- [ ] Editor: sidebar + preview live, Desktop/Mobile toggle, Save Draft, Publish Version, Restore Previous Version, Regenerate selected field (mai rigenerazione distruttiva dell'intera demo) §9.2.
- [ ] Asset manager con provenance registrata; asset in Supabase Storage §9.2, §10.
- [ ] URL pattern `demo.<dominio>/d/<slug>-<short-id>`; slug leggibile ma ID separato; noindex/nofollow; non enumerabile; disattivabile/scadibile; invalidazione cache su publish (§10, §18).
- [ ] Preview sempre disponibile: open public demo + copy URL dalla dashboard (§7.3).

**Test richiesti.**
- Unit: `template-variables.test.ts` (risoluzione variabili, fallback campi mancanti), slug non enumerabile.
- Regression: rendering demo desktop/mobile sul seed template (base per `demo-rendering.spec.ts`).
- E2E (preliminare): create demo → edit → publish → URL pubblico renderizza.

**Rischi residui attesi.**
- Screenshot non ancora disponibili (Phase 5): la UI deve mostrare stato "screenshot in attesa" senza bloccare il resto.
- Cache Vercel della route demo: verificare header e revalidate su publish (rischio demo stale).

---

## PHASE 5 — Jobs + browser contract

**Obiettivo.** Coda job persistente, idempotente, riprendibile con lease atomici; BrowserWorkerProvider (Kimi Work/WebBridge via adapter); pipeline analisi sito e screenshot. Rimozione dell'inline runner.

**File principali** (MAP §Phase 5):
- Migrazione `0007_automation_jobs.sql` (jobs con tutti i campi §15.1, `idempotency_key` UNIQUE, job events, funzioni lease `SKIP LOCKED`).
- Queue: `lib/jobs/{types,queue,worker-loop}.ts`, `lib/jobs/handlers/*` (discovery, enrich, analyze, generate-demo, screenshot), `app/api/cron/worker/route.ts`, `scripts/worker.ts`; **rimozione `lib/jobs/inline-runner.ts`**.
- Provider: `lib/providers/browser-worker/{interface,types,mock,kimi-webbridge,index}.ts`.
- API worker: `app/api/jobs/claim/route.ts`, `app/api/jobs/[id]/complete/route.ts`, `app/api/jobs/[id]/fail/route.ts`, `app/api/demos/[id]/screenshots/route.ts`.

**Gate di chiusura.**
- [ ] Lease/claim atomico dimostrato: due worker concorrenti non processano lo stesso job (§15.1).
- [ ] Idempotenza: stesso `idempotency_key` → nessun duplicato; retry con backoff e `max_attempts` (§15.1, §10.1).
- [ ] Result contract §14.1 persistito in `website_audits` versionato: final URL, redirect chain, contatti pubblici, CTA, pagine, responsive, `issues[]` (type/severity/evidence/confidence), `opportunities[]`.
- [ ] Screenshot pipeline §10.1: gate demo PUBLISHED → desktop → mobile → upload Storage → update `demo_assets`/`campaign_lead`; fallimento = retry e **nessun invio dipendente parte**.
- [ ] Stato ufficiale dei browser job in Supabase; nessuno stato essenziale solo in sessione WebBridge (§14).
- [ ] Adapter Kimi/WebBridge documentato; mock contratto-conforme di default (§22.3, §23.1).
- [ ] Nessuna catena Google→Kimi→AI→demo→screenshot→Resend in una singola HTTP request (§15).

**Test richiesti.**
- Integration: `job-lifecycle.test.ts` (enqueue→claim→complete/fail→retry, lease concorrenti, idempotency).
- Unit: contract validation del risultato analisi (zod schema su §14.1).
- E2E (preliminare): analyze + screenshot su demo seed con mock worker.

**Rischi residui attesi.**
- Vercel serverless timeout per worker loop: mitigare con batch piccoli per invocation e cron frequente; per workload pesanti il worker gira esterno (`scripts/worker.ts`) contro `/api/jobs/claim`.
- Disponibilità/affidabilità sessione WebBridge: timeout + retry policy obbligatori; documentare procedura di re-auth in OPERATIONS.
- Migrazione 0007 creata in questa fase con numerazione successiva a 0004: verificare che nessuno abbia creato 0005/0006 in parallelo (§16.3 — rinumerare senza collisioni).

---

## PHASE 6 — Messaging

**Obiettivo.** Message template versionati, draft personalizzati editabili, Resend adapter server-side, Send Guard, webhook eventi con idempotenza, suppression.

**File principali** (MAP §Phase 6):
- Migrazioni `0005_campaigns_policies.sql` (schema campagne + policy snapshot; UI in Phase 7) e `0006_messaging.sql` — **create in ordine numerico, applicate insieme**.
- Provider: `lib/providers/resend/{interface,mock,live,index}.ts`.
- Domain: `lib/domain/{messaging,suppression,message-events}.ts`, `lib/send-guard.ts`, `lib/webhooks/resend-verify.ts`, handler `generate-message.ts` e `send-message.ts`.
- API: `app/api/messages/drafts/[id]/{test,approve}/route.ts`, `app/api/messages/[id]/send/route.ts`, `app/api/webhooks/resend/route.ts`.
- UI: `components/messages/*`, tab Messages lead.

**Gate di chiusura.**
- [ ] Livelli §11 rispettati: master immutato dalla personalizzazione; draft = snapshot variabili risolte; override manuale non tocca il master; sent message = snapshot immutabile.
- [ ] **Send Guard: tutti i 7 check §11.2** (recipient, lead, campaign, policy snapshot, message, demo/screenshot READY, idempotency campaign_lead+sequence_step). Nessun percorso di invio bypassa il guard.
- [ ] Editor §11.1 completo: subject, token picker, preview risolta, screenshot incorporabile, AI actions, Save Draft, Send Test to Owner, Approve & Schedule/Send, indicazione policy corrente.
- [ ] Webhook Resend: verifica firma + idempotenza evento; hard bounce/unsubscribe/stop → suppression globale e stop invii successivi (§12.2, §18).
- [ ] API key Resend mai al client (§11.2, §18); mock/test mode senza credenziali (§22.3).
- [ ] **Nessuna email reale in test/seed** (§23.1).

**Test richiesti.**
- Unit: `send-guard.test.ts` (tutti i check, uno per caso di blocco), suppression, snapshot immutabilità.
- Integration: `webhook-idempotency.test.ts` (replay stesso evento → nessun effetto doppio).
- E2E (preliminare): draft → edit → preview → send test owner (mock).

**Rischi residui attesi.**
- Campaign non ancora presente (UI Phase 7): Send Guard già scritto contro schema `campaigns`/`campaign_leads` della migrazione 0005 — evitare refactor del guard in Phase 7.
- Deliverability reale (dominio dedicato autenticato §18) è configurazione esterna: resta mock fino a onboarding reale.

---

## PHASE 7 — Campaign + review

**Obiettivo.** Campaign wizard completo §8.1 con simulazione pre-attivazione; Review Queue §8.2; bulk controls sicuri. Safe-by-default (§1): nuove campagne Manual o Score-Based; Full Auto solo con conferma esplicita.

**File principali** (MAP §Phase 7):
- Domain: `lib/domain/{campaigns,campaign-materialization,review-queue,rate-limit}.ts`.
- API: `app/api/campaigns/route.ts`, `app/api/campaigns/[id]/{activate,pause,simulate}/route.ts`, `app/api/review-queue/{route,decisions/route}.ts`.
- UI: pagine `campaigns/`, `campaigns/new`, `campaigns/[id]`, `review/`; componenti `campaigns/*`, `review/*`, `modals/danger-zone-modal.tsx`.

**Gate di chiusura.**
- [ ] Wizard 9 step §8.1: segmento/filtri → conteggio+campione → landing template → message template → follow-up sequence → modalità → soglie/rate limit/finestra/limite giornaliero → simulazione → conferma.
- [ ] Materializzazione `campaign_leads` con **policy snapshot** immutabile; modifiche successive alla policy non retroagiscono (§4.1).
- [ ] Simulazione effetti mostrata prima dell'attivazione (quanti lead per esito: auto-send / review / bloccati) §8.1.
- [ ] Attivazione Full Auto o bulk send solo dietro Danger Zone Modal con conferma esplicita e conteggio record (§8.1, §21).
- [ ] Review Card con tutti gli elementi §8.2 e azioni Approve/Edit/Skip/Reject/Pause Lead; bulk approve solo con conferma + conteggio.
- [ ] Rate limit per workspace/campaign/provider rispettati nel send path (§8.1, §18).
- [ ] Policy Full Auto mai pre-selezionata in nessuna schermata (§6.2).

**Test richiesti.**
- Unit: materializzazione snapshot, simulazione conteggi, rate limit window/day.
- Integration: activation validation; bulk approve transazionale.
- E2E: `campaign-creation.spec.ts`, `manual-approval.spec.ts` (approve → invio mock → evento registrato).

**Rischi residui attesi.**
- Materializzazione di segmenti grandi: chunking + job asincrono (riuso coda Phase 5) per non superare timeout.
- Rischio UX: troppe opzioni in wizard → advanced settings dietro "Advanced" (§6.2 UX RULE).

---

## PHASE 8 — Inbox + follow-up

**Obiettivo.** Thread per lead/campagna con risposta manuale dalla dashboard; sequenze follow-up con cancellazione atomica su reply; stop su bounce/unsubscribe/pause. **Nessun auto-send delle reply in V1** (§12.1).

**File principali** (MAP §Phase 8):
- Domain: `lib/domain/{inbox,followups}.ts`, handler `followup-step.ts`.
- API: `app/api/inbox/threads/route.ts`, `app/api/inbox/threads/[id]/{route,reply/route,actions/route}.ts`.
- UI: pagine `inbox/`, `inbox/[threadId]`, `automations/`; componenti `inbox/*`, `automations/job-status-table.tsx`, tab Timeline lead.

**Gate di chiusura.**
- [ ] Regole §12.2 tutte implementate: no reply entro N giorni → step successivo se eleggibile; reply ricevuta → **cancel atomico** di tutti i follow-up pendenti (transazione unica); hard bounce → suppression+stop; unsubscribe/stop → suppression globale; campaign paused → nessun nuovo send, job sospesi.
- [ ] Inbox: filtri unread/interested/needs reply/automated/archived; risposta manuale guardata; link diretti a lead, demo, timeline (§12.1).
- [ ] AI summary/suggested reply opzionali e mai auto-inviati (§12.1).
- [ ] Pagina Automations: policy attive, sequenze, job status/code con retry visibili (§6.1).
- [ ] Reply inbound dal webhook Resend aggiorna thread, ferma follow-up, aggiorna business_status lead (§3.1).

**Test richiesti.**
- Integration: cancellazione atomica follow-up su reply (concorrenza: job follow-up in flight mentre arriva reply → Send Guard blocca).
- Unit: eleggibilità step, finestre N giorni, stop conditions.
- E2E: invio (mock) → reply simulata via webhook → follow-up cancellato e visibile in timeline.

**Rischi residui attesi.**
- Race condition reply-vs-followup: mitigata da re-check eleggibilità dentro Send Guard + transazione di cancel; test di concorrenza obbligatorio.
- Classificazione "interested" in V1 è manuale/AI-assisted: non promettere automazione commerciale (scope §2).

---

## PHASE 9 — Analytics + operations

**Obiettivo.** KPI funnel §20 con drill-down; health provider; activity log append-only e Decision Trace; kill switch §19.2; onboarding guidato §6.2; settings.

**File principali** (MAP §Phase 9):
- Migrazioni `0008_activity_audit.sql` (append-only), `0009_provider_settings.sql` (provider connections, feature flags, kill switch state).
- Domain: `lib/domain/{activity,decision-trace,analytics,retention}.ts`, `lib/kill-switch.ts`, `lib/health.ts`.
- API: `app/api/analytics/{overview,drilldown}/route.ts`, `app/api/health/providers/route.ts`, `app/api/settings/{providers,kill-switch}/route.ts`, `app/api/onboarding/status/route.ts`.
- UI: pagine `analytics/`, `settings/*`, `onboarding/`; componenti `kpi-card.tsx`, `provider-status.tsx`, `decision-trace.tsx`, `timeline.tsx`, `kill-switch-banner.tsx`.

**Gate di chiusura.**
- [ ] Decision Trace §19.1 ricostruibile per ogni invio: source, dati, audit version, score breakdown + algorithm version, policy version + condizioni soddisfatte, demo/template/version, message version, Send Guard result, provider message ID, webhook events.
- [ ] `activity_log` append-only: update/delete revocati a livello DB; scritture solo dal domain layer (§16.4).
- [ ] Kill switch §19.2 tutti funzionanti: PAUSE ALL OUTREACH, Pause Campaign, Pause Discovery, Pause Browser Workers, Disable Provider; globale sempre raggiungibile dalla dashboard; **lettura fail-closed nel send path** (se lo stato non è leggibile → non si invia).
- [ ] Analytics: 7 funnel §20 e drill-down categoria → campagna → template → score band.
- [ ] Onboarding 10 step §6.2: verifica credenziali Google/Resend, check Storage, categorie/territori, modalità default Manual o Score-Based (**Full Auto non pre-selezionato**), soglie, template, Test Run senza invio, checklist finale verde/ambra/rosso con link correttivi.
- [ ] Provider Status mostra health/configurazione senza esporre secret (§18, §21).
- [ ] Retention configurabile (§18) — job di pulizia documentato.

**Test richiesti.**
- Unit: `kill-switch.test.ts` (fail-closed), decision trace assembly, retention config.
- Integration: append-only enforcement a livello DB; kill switch globale blocca send job reale (mock provider).
- E2E: `onboarding.spec.ts` completo; attivazione kill switch da UI → invio bloccato con messaggio e next action (§21.1).

**Rischi residui attesi.**
- Costo query analytics su tabelle eventi: indici/viste materializzate se necessario, senza cambiare schema contrattuale.
- Onboarding dipende da configurazioni esterne reali (domini, webhook): in assenza, checklist resta ambra/rossa per design — non aggirare con stati finti.

---

## PHASE 10 — QA + hardening

**Obiettivo.** Copertura test minimi §22.2 completa e verde; seed §22.1; documentazione DoD; performance e security hardening; chiusura V1.

**File principali** (MAP §Phase 10):
- Migrazione `0010_seed_baseline.sql`, `supabase/seed.sql`, `scripts/seed.ts`.
- Test: `tests/unit/*`, `tests/integration/*`, `tests/e2e/*`, `tests/security/*`, `tests/regression/*` (elenco completo in MAP).
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/OPERATIONS.md`.
- CI: `playwright.config.ts`, `.github/workflows/ci.yml`.

**Gate di chiusura.** La checklist Definition of Done §22.3 (sotto) tutta verde.

**Test richiesti.** Intera matrice §22.2 in CI: unit, integration (Supabase locale), E2E (mock provider), security, regression.

**Rischi residui attesi.**
- Flakiness E2E browser: retry mirati e selettori stabili (data-testid), non `sleep`.
- Copertura RLS: ogni nuova tabella futura deve avere test security corrispondente (regola permanente).

---

## Seed §22.1 (Phase 10, ma progettato fin da Phase 4)

Contenuto obbligatorio del seed:
- [ ] 5 categorie demo.
- [ ] 2 landing template per almeno una categoria prioritaria.
- [ ] 2 message template + 1 follow-up sequence.
- [ ] 20 lead fake realistici con differenti score/stati (coprire: NEW, QUALIFIED, CAMPAIGN_READY, CONTACTED, REPLIED, SUPPRESSED; processing status vari; con/senza sito; con/senza email).
- [ ] Eventi email fake per Inbox/Analytics (delivered, open, click, bounce, reply).
- [ ] **Nessun dato reale o secret nel repository** (§22.1); nessuna email reale inviabile dal seed (§23.1) — provider in mock.

## Definition of Done §22.3 — checklist finale V1

- [ ] Fresh clone → install → migrations → seed → local run **documentato in README** e verificato da ambiente pulito.
- [ ] Nessun TypeScript error, lint blocker o test rosso (CI verde).
- [ ] RLS applicata e testata su tutte le tabelle tenant-owned (test security).
- [ ] Demo route renderizza seed template (desktop + mobile).
- [ ] Message editor salva override **senza modificare il master template** (test dedicato).
- [ ] Policy Manual / Score-Based / Full Auto dimostrata con test (unit + E2E dry run).
- [ ] Job retry/idempotency dimostrati (integration test lifecycle).
- [ ] Resend adapter con mock/test mode se credenziali assenti.
- [ ] Google Places adapter con mock/test mode.
- [ ] BrowserWorkerProvider interface implementata e usata dal core.
- [ ] Kimi/WebBridge adapter documentato (ARCHITECTURE/OPERATIONS).
- [ ] Kill switch globale testato (unit fail-closed + E2E).
- [ ] README + ARCHITECTURE + DATABASE + OPERATIONS aggiornati.

## Report finale obbligatorio (§26)

Al termine di V1, oltre a dichiarare "fatto", riportare: route implementate; tabelle e migrazioni; test eseguiti; feature complete/parziali/bloccate; configurazioni esterne mancanti; rischi residui; checklist di avvio produzione.
