# OPERATIONS RUNBOOK — Sales Automation OS

**Riferimento:** `MASTER_SPEC.md` (§6.2, §15, §18, §19.2, §22, §23.1, §26) e `DATABASE_MIGRATION_PLAN.md`
**Scopo:** istruzioni operative per setup locale, seed, mock mode, kill switch, coda job, webhook e go-live. Solo feature V1 (§2.2). Nessun dato reale o secret in questo documento.

---

## 1. Prerequisiti

| Strumento | Versione | Verifica |
|---|---|---|
| Node.js | >= 20 LTS | `node -v` |
| pnpm (o npm) | >= 9 | `pnpm -v` |
| Supabase CLI | >= 1.187 | `supabase --version` |
| Docker Desktop / Docker Engine | recente | `docker info` (richiesto da `supabase start`) |
| Git | qualunque recente | `git --version` |

Non serve alcun account/provider esterno per lavorare in locale: **tutti i provider partono in modalità mock** (§5).

---

## 2. Variabili d'ambiente — `.env.example` documentato

Copiare `.env.example` in `.env.local` (Next.js) e non committare mai `.env.local` né alcun file con secret reali (§18: secrets solo server-side env/secret store). I valori sotto sono **placeholder**, non credenziali.

```dotenv
# ─── Supabase ────────────────────────────────────────────────────────────────
# URL del progetto Supabase. Locale (supabase start): http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# Chiave pubblica anon: sicura lato client (RLS attiva su tutte le tabelle)
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-locale-o-del-progetto>
# Chiave service role: SOLO SERVER-SIDE (§11.2/§18). Mai in NEXT_PUBLIC_*, mai nel client bundle.
# Bypassa RLS: usata da Domain Services, Job Orchestrator e worker.
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-locale-o-del-progetto>

# ─── App ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Base URL pubblico delle demo (§10): pattern https://demo.<dominio>/d/<slug>-<short-id>
DEMO_BASE_URL=http://localhost:3000/d

# ─── Provider mode: mock | live — uno per provider (§22.3, §23.1) ───────────
# Default SICURO: mock. In mock nessuna chiamata esterna, nessun costo, nessuna email reale.
GOOGLE_PLACES_PROVIDER_MODE=mock
RESEND_PROVIDER_MODE=mock
BROWSER_WORKER_PROVIDER_MODE=mock
AI_PROVIDER_MODE=mock

# ─── Google Places (§13) — necessaria SOLO se GOOGLE_PLACES_PROVIDER_MODE=live
GOOGLE_PLACES_API_KEY=<solo-se-live>

# ─── Resend (§11.2) — necessarie SOLO se RESEND_PROVIDER_MODE=live ──────────
RESEND_API_KEY=<solo-se-live>
# Secret di firma webhook (svix) per POST /api/webhooks/resend (§18)
RESEND_WEBHOOK_SECRET=<solo-se-webhook-live>
# Dominio mittente dedicato e autenticato (§18 domain reputation). Non il dominio principale.
RESEND_SENDER_DOMAIN=<sottodominio-outreach-esempio.example.com>

# ─── AI provider (§1 provider abstraction) — necessarie SOLO se AI_PROVIDER_MODE=live
AI_PROVIDER_API_KEY=<solo-se-live>
AI_PROVIDER_MODEL=<nome-modello-configurabile>
AI_PROVIDER_BASE_URL=<opzionale-endpoint-custom>

# ─── Browser Worker (§14) — necessarie SOLO se BROWSER_WORKER_PROVIDER_MODE=live
BROWSER_WORKER_API_KEY=<solo-se-live>
BROWSER_WORKER_ENDPOINT=<endpoint-webbridge-o-playwright>

# ─── Job Orchestrator / Worker (§15) ─────────────────────────────────────────
WORKER_ID=worker-local-1            # lease_owner nei job
JOB_LEASE_SECONDS=300               # durata lease claim_job
JOB_POLL_INTERVAL_MS=5000           # polling coda
JOB_BACKOFF_BASE_SECONDS=60         # base backoff esponenziale retry

# ─── Seed (§22.1) — abilita la migration/seed 0010. MAI 'on' in production ──
SEED_MODE=on

# ─── Ambiente ────────────────────────────────────────────────────────────────
NODE_ENV=development
```

**Regole non negoziabili:**
- Qualunque variabile non `NEXT_PUBLIC_*` resta server-side; le API key dei provider non arrivano mai al client (§11.2).
- Se una credenziale manca, l'adapter corrispondente **deve restare/rientrare in mock** — mai fallire a runtime con secret parziali (§22.3: mock/test mode se credenziali assenti).
- Rotazione secret: aggiornare env/secret store e riavviare i processi server; nessuna modifica al DB (i secret non sono in DB, vedi `provider_connections`).

---

## 3. Avvio locale — fresh clone → install → migrate → seed → dev (§22.3 DoD)

```bash
# 1. Clone
git clone <repo-url> sales-automation-os && cd sales-automation-os

# 2. Variabili d'ambiente (default: tutto mock, nessuna credenziale richiesta)
cp .env.example .env.local

# 3. Dipendenze
pnpm install

# 4. Supabase locale (avvia Postgres, Auth, Storage, Studio su porte locali)
supabase start
#    → annotare API URL / anon key / service_role key locali stampate a video
#      e riportarle in .env.local se diverse dai default

# 5. Migrazioni (incrementali, ripetibili; MAI 'supabase db reset' fuori dal locale §23.1)
supabase migration up
supabase migration list   # verifica: 0001–0010 applied, nessuna divergenza

# 6. Seed baseline non-production (§22.1, vedi §6 di questo runbook)
#    Il seed è eseguito automaticamente da 'supabase db reset'/'supabase start'
#    se configurato in config.toml; per applicarlo su DB locale già avviato:
pnpm db:seed              # wrapper: psql -f supabase/seed.sql con SEED_MODE=on

# 7. Dev server (dashboard + BFF + route demo)
pnpm dev                  # http://localhost:3000

# 8. Worker job (terminale separato)
pnpm worker               # loop claim_job → execute → complete/fail
```

**Verifica fumo (5 min):**
1. Login con utente seed → dashboard Overview visibile.
2. Leads → 20 lead fake con badge categoria/score.
3. Lead detail → tab Demo mostra preview template seed.
4. Automations → job status visibili; nessun job `FAILED` dopo il primo run.
5. Nessuna email reale inviata: `RESEND_PROVIDER_MODE=mock` attivo (§5).

---

## 4. Struttura processi

| Processo | Comando | Ruolo |
|---|---|---|
| Next.js Web | `pnpm dev` / `pnpm start` | dashboard, BFF/API (§17), route demo pubbliche |
| Worker | `pnpm worker` | loop `claim_job` (lease) → esecuzione → complete/fail (§15) |
| Supabase locale | `supabase start` | system of record, storage, auth (§15) |
| Webhook tunnel (opz.) | vedi §8 | esporre `/api/webhooks/resend` a Resend in dev live |

---

## 5. Mock / test mode obbligatorio senza credenziali (§23.1, §22.3)

**Regola d'oro: senza credenziali valide l'ambiente è in mock mode e NON può inviare email reali né spendere quote API.**

| Provider | Mock mode comportamento | Passaggio a live |
|---|---|---|
| Google Places | dataset deterministico di place fake (coerente con seed); nessuna quota consumata | impostare `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACES_PROVIDER_MODE=live` |
| Resend | nessuna chiamata HTTP; genera `provider_message_id`/`provider_event_id` sintetici e `message_events` simulati (DELIVERED/OPENED) per testare Inbox/Analytics | `RESEND_API_KEY` + `RESEND_PROVIDER_MODE=live` + dominio autenticato |
| Browser Worker | risposte contract §14.1 sintetiche + screenshot placeholder in Storage | `BROWSER_WORKER_PROVIDER_MODE=live` + endpoint/credenziali |
| AI provider | testi deterministici con variabili risolte | `AI_PROVIDER_API_KEY` + `AI_PROVIDER_MODE=live` |

Vincoli operativi:
- **Mai email reali durante test/seed (§23.1).** Anche in live locale, inviare solo verso indirizzi di test del provider o verso l'owner (`Send Test to Owner`, §11.1). Gli indirizzi seed usano domini riservati (`example.com`).
- Il mock mode non è un ramo di codice diverso: stesso adapter, stesso contract, backend sostituito (§1 provider abstraction).
- Ogni adapter esterno deve avere mock/test mode (§23.1) — requisito di Definition of Done (§22.3).
- CI/E2E girano sempre in mock mode (test "full-auto dry run", §22.2).

---

## 6. Procedura seed (§22.1)

Contenuto seed (migration/seed `0010_seed_baseline`, dettagli in `DATABASE_MIGRATION_PLAN.md` §13):

- 1 workspace demo (`default_policy_mode = MANUAL`);
- 5 categorie demo (come category/tag/segmenti di esempio);
- 2 landing template con versioni pubblicate per almeno una categoria prioritaria;
- 2 message template con versioni + 1 follow-up sequence (2 step);
- 20 lead fake realistici con score/stati diversi (con/senza sito, con/senza email, stati business e processing vari);
- eventi email fake (delivered/opened/clicked/bounced/replied) per Inbox e Analytics;
- 4 righe `provider_connections` in `MOCK` + kill switch tutti disattivati;
- **nessun dato reale o secret nel repository** (§22.1).

Esecuzione:
```bash
# Fresh setup locale (ricrea il DB: SOLO locale, mai staging/prod §23.1)
supabase db reset          # applica migrations + seed.sql

# Seed su DB locale già avviato (senza reset)
pnpm db:seed               # richiede SEED_MODE=on

# Verifica
#   select count(*) from leads;        -- 20
#   select key from message_templates; -- 2
#   select provider, mode from provider_connections; -- 4 righe MOCK
```

Il seed è **idempotente lato operazione**: rieseguire su DB pulito. Per ri-seedare usare `supabase db reset` in locale. In staging il seed si applica solo manualmente e con `SEED_MODE=on` esplicito; in production `SEED_MODE` deve essere assente/`off` (la migration 0010 si auto-salta, vedi guardia in `DATABASE_MIGRATION_PLAN.md` §13.1).

---

## 7. Kill switch (§19.2) — come usarli

Stato persistito in `workspace_feature_flags` e `provider_connections`/`campaigns` (vedi `DATABASE_MIGRATION_PLAN.md` §12.3). Ogni attivazione/rilascio scrive `KILL_SWITCH_ACTIVATED` / `KILL_SWITCH_RELEASED` in `activity_log`. I controlli sono letti **server-side** da Job Orchestrator (prima di enqueue/claim) e da Send Guard (prima di ogni send).

| Controllo | Dove si attiva (dashboard) | Stato persistito | Effetto immediato |
|---|---|---|---|
| **PAUSE ALL OUTREACH** | pulsante globale sempre raggiungibile nella topbar (§19.2) + Danger Zone Modal di conferma | `workspace_feature_flags['OUTREACH_PAUSED_ALL'] = {enabled:true}` | nessun nuovo send né follow-up; job `SEND_MESSAGE`/`FOLLOWUP_STEP` non vengono più enqueued né eseguiti |
| Pause Campaign | pagina Campaign → "Pausa" | `campaigns.status = 'PAUSED'` | nessun nuovo send della campagna; job pendenti restano sospesi (§12.2) |
| Pause Discovery | Automations → "Pause Discovery" | `workspace_feature_flags['DISCOVERY_PAUSED']` | nessun nuovo job Google (`DISCOVERY_RUN`, `LEAD_ENRICHMENT`) |
| Pause Browser Workers | Automations → "Pause Browser Workers" | `workspace_feature_flags['BROWSER_WORKERS_PAUSED']` | nessun nuovo job `WEBSITE_ANALYSIS` / `SCREENSHOT_*` |
| Disable Provider | Settings → Provider → "Disable" | `provider_connections.status = 'DISABLED'` per il provider scelto | nessuna nuova call al provider; i job dipendenti falliscono con `error_code = PROVIDER_DISABLED` e retry sospeso |

**Fallback operativo (SQL via service_role / Supabase Studio), se la dashboard non è raggiungibile:**
```sql
-- PAUSE ALL OUTREACH
insert into workspace_feature_flags (workspace_id, key, value, updated_by)
values ('<workspace_id>', 'OUTREACH_PAUSED_ALL',
        '{"enabled": true, "reason": "emergenza operativa", "set_by": "runbook"}', null)
on conflict (workspace_id, key)
do update set value = excluded.value, updated_at = now();

-- Disable Provider (es. RESEND)
update provider_connections
set status = 'DISABLED', updated_at = now()
where workspace_id = '<workspace_id>' and provider = 'RESEND';
```

**Ripresa:** stessa procedura con `enabled:false` / `status='CONNECTED'` / `campaigns.status='ACTIVE'`. I job `RETRYING`/`QUEUED` riprendono automaticamente al prossimo claim; verificare la coda (§8) dopo il rilascio. Il kill switch globale è requisito DoD: testato in E2E (§22.3).

---

## 8. Gestione coda job — claim, retry, stuck recovery (§15, §15.1)

### 8.1 Modello
- Job persistenti, idempotenti, riprendibili (§15). Nessuna concatenazione Google → AI → demo → screenshot → Resend in una sola HTTP request: ogni fase è un job.
- **Enqueue**: INSERT su `automation_jobs` con `idempotency_key` UNIQUE (convenzione `<job_type>:<entity_type>:<entity_id>:<scope>`). Doppio enqueue = errore unique gestito come no-op.
- **Claim atomico**: i worker chiamano `claim_job(worker_id, job_types, lease_seconds)` (SQL `FOR UPDATE SKIP LOCKED`) — nessuna doppia elaborazione. Lease di default 300s.
- **Complete/Fail**: il worker scrive `result`/`error_code`/`error_detail` e aggiorna `status` → `SUCCEEDED`/`FAILED`; in caso di retry: `RETRYING` + `next_retry_at = now() + backoff_esponenziale` fino a `max_attempts`.
- **Dipendenze**: `depends_on_job_id` (es. `SCREENSHOT_MOBILE` dopo `SCREENSHOT_DESKTOP`; nessun send dipendente parte se screenshot fallito §10.1).
- **Cancellazione**: reply ricevuta → cancel atomico di tutti i follow-up pendenti del lead (§12.2): UPDATE `status='CANCELLED'` sui job `FOLLOWUP_STEP`/`SEND_MESSAGE` non ancora in lease.

### 8.2 Query operative essenziali (Supabase Studio o psql)
```sql
-- Stato coda per workspace
select status, job_type, count(*)
from automation_jobs
where workspace_id = '<workspace_id>'
group by 1,2 order by 1,2;

-- Job in retry / falliti
select id, job_type, entity_id, attempt_count, max_attempts, next_retry_at, error_code
from automation_jobs
where status in ('RETRYING','FAILED')
order by next_retry_at nulls first;

-- Job bloccati: RUNNING con lease scaduto
select id, job_type, lease_owner, lease_expires_at, attempt_count
from automation_jobs
where status = 'RUNNING' and lease_expires_at < now();

-- Audit tecnico di un job
select event_type, actor, payload, created_at
from automation_job_events
where job_id = '<job_id>' order by created_at;
```

### 8.3 Stuck job recovery
- Scheduler periodico (cron esterno / Supabase scheduled function / endpoint admin protetto) chiama:
  ```sql
  select public.recover_stuck_jobs();   -- lease scaduti → RETRYING (backoff) o FAILED a max_attempts
  ```
- Frequenza consigliata: ogni 60s in produzione; manuale in locale.
- Job `FAILED` definitivi: analizzare `error_code`/`error_detail` + `automation_job_events`; per riprovare, il domain layer re-enqueue con **nuova** `idempotency_key` (suffisso `:retry-<n>`) — mai UPDATE di stato manuale su job `SUCCEEDED`/`FAILED` senza evento `RECOVERED` in `automation_job_events`.
- Worker crash: il lease scade da solo (`lease_expires_at`) → recovery automatico. Nessun lock eterno possibile.

---

## 9. Webhook Resend — firma + idempotenza (§18)

Endpoint: `POST /api/webhooks/resend` (§17). Handler sottile: la logica vive nel Domain Service messaggi.

### 9.1 Procedura di verifica per ogni richiesta
1. **Verifica firma**: validare gli header di firma (svix: `svix-id`, `svix-timestamp`, `svix-signature`) con `RESEND_WEBHOOK_SECRET`. Firma invalida → `401` e nessuna scrittura.
2. **Idempotenza evento (§18)**: dedupe su `message_events.provider_event_id` (UNIQUE). Evento già presente → `200` immediato, nessun side-effect (safe replay).
3. **Enqueue**: il processing effettivo (aggiornamento stato messaggio, suppression su hard bounce/unsubscribe §12.2, cancel follow-up su reply) avviene tramite job `WEBHOOK_PROCESSING` — mai lavoro pesante nella request webhook.
4. Risposta `2xx` solo dopo persistenza dell'evento; errori transitori → `5xx` per retry del provider.

### 9.2 Mappatura eventi → azioni (§12.2)
| Evento Resend | `message_event_type` | Azione domain |
|---|---|---|
| `email.delivered` | DELIVERED | aggiorna timeline |
| `email.opened` / `email.clicked` | OPENED / CLICKED | engagement analytics |
| `email.bounced` (hard) | BOUNCED | suppression + stop (§18) |
| `email.complained` | COMPLAINED | suppression + stop |
| unsubscribe / stop request | UNSUBSCRIBED | suppression globale indirizzo + stop |
| inbound reply | REPLIED | thread Inbox + **cancel atomico follow-up pendenti** |

### 9.3 Test locale
- Mock mode (default): l'adapter genera eventi sintetici, nessun webhook esterno necessario.
- Live dev: `resend` CLI/tunnel verso `http://localhost:3000/api/webhooks/resend`, con `RESEND_WEBHOOK_SECRET` di test; verificare che un replay dello stesso `svix-id` non duplichi `message_events` (test integration "webhook idempotency", §22.2).

---

## 10. Onboarding guidato (§6.2) — esecuzione e checklist verde/ambra/rosso

Wizard in 10 step alla prima esecuzione. Stato finale mostrato come checklist; ogni voce ha link diretto alla correzione.

| # | Step | Verde | Ambra | Rosso |
|---|---|---|---|---|
| 1 | Welcome "Trova → Qualifica → Demo → Contatta" | completato | — | — |
| 2 | Google Places collegato | credenziali verificate (`provider_connections.status=CONNECTED`, `last_verified_at` recente) | mode=mock attivo (ok per iniziare) | chiave assente/invalida con mode=live |
| 3 | Resend + dominio mittente + webhook | dominio autenticato + webhook verificato (firma ok, evento test ricevuto) | dominio configurato non verificato / webhook non testato | nessun provider email configurato |
| 4 | Supabase Storage/bucket | bucket demo-assets raggiungibile (upload/download test ok) | bucket esistente con policy da rivedere | bucket mancante |
| 5 | Categorie e territori iniziali | ≥ 1 categoria + 1 area salvate | solo categorie senza area (o viceversa) | nessuna selezione |
| 6 | Modalità predefinita | MANUAL o SCORE_BASED scelta esplicitamente | — | — (FULL_AUTO **mai** pre-selezionato §6.2) |
| 7 | Soglie score/confidence | soglie salvate (default consigliate §5.2) | default accettati senza revisione | soglie incoerenti (es. min > max) |
| 8 | Template iniziali | ≥ 1 landing + 1 message template selezionati | solo uno dei due | nessun template |
| 9 | Test Run su pochi lead | run completato senza errori, **nessun invio** | run completato con warning | run fallito |
| 10 | Checklist finale | tutte verdi/ambra accettate | ≥ 1 ambra | ≥ 1 rossa → blocco attivazione campagne |

Regole: configurazioni avanzate dietro "Advanced settings" (§6.2 UX rule); il Test Run (step 9) è sempre **senza invio** — gate "Mai invio" delle fasi pipeline (§3).

---

## 11. Checklist di avvio produzione (§26)

### Database & migrazioni
- [ ] `supabase migration list` sul progetto linked: 0001–0010 applied, nessuna divergenza; **nessun reset** in produzione (§23.1).
- [ ] `SEED_MODE` assente/off in produzione; nessun dato seed nel DB prod.
- [ ] RLS verificata con test Security (§22.2): isolamento workspace, Viewer read-only, `activity_log` append-only.
- [ ] Test lease/idempotenza job superati (`claim_job` concorrente, doppio enqueue, stuck recovery).

### Secrets & provider
- [ ] Tutti i secret in env/secret store server-side; nessun secret nel repo, nel client bundle o in `provider_connections` (§18).
- [ ] `*_PROVIDER_MODE=live` solo dove voluto; verifica che un provider senza credenziali ricada in mock.
- [ ] Dominio outreach dedicato e autenticato (SPF/DKIM/DMARC) — non il dominio principale (§18 domain reputation).
- [ ] Webhook Resend configurato con firma verificata e idempotenza testata (replay sicuro).

### Sicurezza operativa
- [ ] Kill switch globali testati (PAUSE ALL OUTREACH raggiungibile dalla dashboard; DoD §22.3).
- [ ] Rate limit per workspace/campaign/provider configurati (§18).
- [ ] Suppression list operativa: hard bounce/unsubscribe/stop bloccano invii successivi.
- [ ] Retention policy configurata in `workspaces.settings` (§18: configurabile, non hardcoded).
- [ ] Demo pubbliche: `noindex,nofollow`, URL non enumerabili (`short_id` casuale), disattivabili/scadibili (§10).

### Funzionale & osservabilità
- [ ] Test suite verde: unit (scoring, policy, Send Guard, dedupe, template variables), integration (repositories, job lifecycle, webhook idempotency), E2E (onboarding, discovery fake, preview, campaign, manual approval, full-auto dry run), security, regression (§22.2).
- [ ] Policy Manual/Score-Based/Full Auto dimostrata con test; nuove campagne partono Manual/Score-Based (§1 safe-by-default).
- [ ] Decision Trace ricostruibile per un invio di prova (§19.1: source, audit version, score breakdown, policy version, template/versioni, Send Guard result, provider message id, webhook events).
- [ ] Scheduler `recover_stuck_jobs` attivo; monitoring coda (query §8.2) disponibile.
- [ ] Documentazione aggiornata: README, ARCHITECTURE, DATABASE, OPERATIONS (§22.3 DoD).

### Go / No-Go
- [ ] Nessun TypeScript error, lint blocker o test rosso (§22.3).
- [ ] Configurazioni esterne mancanti documentate; rischi residui registrati in `RISK_REGISTER.md` (§26).

---

## 12. Troubleshooting rapido

| Sintomo | Causa probabile | Azione |
|---|---|---|
| `supabase start` fallisce | Docker non avviato / porte occupate | avviare Docker; `supabase stop` e riprovare |
| Migration "already applied" / divergenza | DB locale sporco | solo locale: `supabase db reset`; mai in staging/prod |
| Nessun lead dopo seed | `SEED_MODE` non on / seed non eseguito | `pnpm db:seed` con `SEED_MODE=on`, verificare §6 |
| Worker non processa | lease residui / kill switch attivo / `BROWSER_WORKERS_PAUSED` | query §8.2; `select public.recover_stuck_jobs();`; verificare flag §7 |
| Job sempre FAILED stesso `error_code` | errore deterministico (config provider) | leggere `error_detail` + `automation_job_events`; correggere config; re-enqueue con nuova idempotency key |
| Webhook 401 | `RESEND_WEBHOOK_SECRET` errato/ruotato | riallineare secret env ↔ dashboard Resend |
| Email non parte in live | Send Guard check fallito | Decision Trace in `activity_log` (`SEND_GUARD_RESULT`) indica il check bloccante |
| Dashboard mostra provider rossi | `provider_connections.status` DEGRADED/DISABLED | Settings → Provider → verifica credenziali / riabilita |
