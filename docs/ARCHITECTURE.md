# ARCHITECTURE — Sales Automation OS

**Versione:** 1.0 (baseline V1)
**Riferimenti:** `docs/MASTER_SPEC.md` v1.0 (§3, §4, §10, §11.2, §14, §15, §16, §19); `docs/CURRENT_STATE_AUDIT.md`
**Stato:** greenfield — architettura proposta ex-novo, nessun vincolo legacy.

---

## 1. Visione d'insieme

La piattaforma è un **Sales Automation Operating System** lead-centrico (§1): il lead è l'oggetto centrale e audit, score, demo, screenshot, messaggi, campagne, reply, follow-up e conversione sono collegati al lead e tracciati.

Stack congelato (§24): **Next.js su Vercel** (dashboard + BFF/API + route demo pubbliche), **Supabase** (system of record, storage, auth, audit), **Google Places API** (discovery), **Kimi Work/WebBridge** via adapter (browser automation), **Resend** (email).

Regole architetturali cardine:

- **Mai una mega-request**: non concatenare Google → Kimi → AI → demo → screenshot → Resend in una singola HTTP request (§15). Tutto il lavoro asincrono passa per **job persistenti, idempotenti e riprendibili** (§15.1).
- **API route sottili**: la logica vive nei Domain Services (§17).
- **Nessun accoppiamento a provider**: ogni provider esterno dietro adapter con mock/test mode (§1, §22.3, §23.1).
- **Supabase è il system of record**: nessuna informazione essenziale vive solo nella sessione WebBridge (§14, "No hidden state").

## 2. Layer architetturali (§15)

| Layer | Responsabilità (§15) | Collocazione proposta |
|---|---|---|
| Next.js Web | dashboard, BFF/API, route demo | `app/` |
| Domain Services | lead, scoring, policy, template, campaign, messaging | `lib/domain/` |
| Job Orchestrator | enqueue, lease, retry, dependency graph, cancellation | `lib/jobs/` |
| Provider Adapters | Google, AI, Browser Worker, Resend | `lib/providers/` |
| Supabase | system of record, storage, auth, audit | `supabase/` + client server-side |

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI[Dashboard Next.js<br/>AppShell / Lead Center / Campaign Center]
        DEMOUI[Demo pubblica<br/>demo.&lt;dominio&gt;/d/&lt;slug&gt;-&lt;shortid&gt;]
    end

    subgraph Web["Next.js Web (Vercel)"]
        BFF[API Routes / BFF<br/>route sottili §17]
        DEMOROUTE[Route demo pubbliche<br/>noindex,nofollow §10]
    end

    subgraph Domain["Domain Services lib/domain"]
        LEAD[Lead Service<br/>dedupe §13.2]
        SCORE[Score Engine<br/>5 dimensioni §5.1]
        POLICY[Policy Engine<br/>decide lui, non lo Score Engine §5.2]
        TMPL[Template Service<br/>master+versioni §9/§11]
        CAMP[Campaign Service]
        MSG[Messaging Service<br/>draft/versioning §11]
        GUARD[Send Guard §11.2]
    end

    subgraph Jobs["Job Orchestrator lib/jobs"]
        QUEUE[Coda persistente<br/>automation_jobs §15.1]
        LEASE[Lease atomici DB]
        RETRY[Retry/backoff +<br/>dependency graph + cancellation]
        WORKER[Worker runner<br/>claim/complete/fail §17]
    end

    subgraph Providers["Provider Adapters lib/providers"]
        G[GooglePlacesProvider<br/>mock/live §13]
        AI[AIProvider<br/>confidence/personalizzazione]
        BW[BrowserWorkerProvider<br/>Kimi WebBridge §14]
        RS[ResendProvider<br/>server-side §11.2]
    end

    subgraph SB["Supabase (System of Record)"]
        DB[(Postgres + RLS §16.4)]
        ST[(Storage<br/>asset/screenshot §10)]
        AUTH[Auth]
    end

    UI --> BFF
    DEMOUI --> DEMOROUTE
    BFF --> Domain
    DEMOROUTE --> TMPL
    Domain --> QUEUE
    QUEUE --> LEASE --> WORKER
    WORKER --> Providers
    GUARD --> RS
    Domain --> DB
    Providers --> SB
    RETRY --> QUEUE
```

## 3. Pipeline lead-first (§3) e separazione acquisizione/outreach

Acquisizione e outreach sono **nettamente separate** (§3). Le fasi Discovery → Scoring hanno gate "**Mai invio**"; l'unico punto di emissione è Send, protetto da Send Guard server-side.

```mermaid
flowchart LR
    subgraph Acquisizione["ACQUISIZIONE — mai invio (gate §3)"]
        D[Discovery<br/>Google Places §13<br/>input: categoria+area+filtri] --> E[Enrichment<br/>sito/telefono/contatti pubblici]
        E --> A[Website Analysis<br/>Browser Worker §14.1]
        A --> S[Scoring<br/>score+confidence+motivazioni §5.1]
        S --> SEG[Segmentation<br/>segmento salvabile §5.3]
    end
    GATE{{Owner decide campagna<br/>§3 Segmentation}}
    SEG --> GATE
    subgraph Outreach["OUTREACH — gated da policy"]
        DEM[Demo<br/>template versionato §9]
        MES[Message<br/>bozza editabile §11]
        SND[Send<br/>Send Guard §11.2]
        FU[Follow-up §12.2]
        DEM --> MES --> SND --> FU
    end
    GATE --> DEM
    SND -.->|stop su| RPL[Reply / Suppression<br/>§12.2]
    RPL -.->|cancel atomico| FU
```

Flusso operativo corretto (§5.3): **Trova lead → Qualifica → Salva segmento → Crea campagna → Genera demo/messaggi → Invia secondo policy.**

## 4. Stati separati business / processing (§3.1)

Non esiste un singolo status: ogni lead porta due assi indipendenti.

**Business status** (significato commerciale):
`NEW → QUALIFIED → CAMPAIGN_READY → CONTACTED → REPLIED → INTERESTED → WON | LOST | NOT_INTERESTED | SUPPRESSED`

**Processing status** (stato macchina di elaborazione):
`IDLE | ENRICHING | ANALYZING | SCORING | DEMO_GENERATING | SCREENSHOT_GENERATING | MESSAGE_GENERATING | SENDING | FAILED`

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> ENRICHING: enrichment job
    ENRICHING --> ANALYZING: enrichment ok
    ANALYZING --> SCORING: audit ok
    SCORING --> IDLE: score salvato
    IDLE --> DEMO_GENERATING: demo job
    DEMO_GENERATING --> SCREENSHOT_GENERATING: demo PUBLISHED §10.1
    SCREENSHOT_GENERATING --> MESSAGE_GENERATING: asset pronti
    MESSAGE_GENERATING --> IDLE: draft pronta
    IDLE --> SENDING: policy + Send Guard ok
    SENDING --> IDLE: inviato
    ENRICHING --> FAILED: errore
    ANALYZING --> FAILED: errore
    SCORING --> FAILED: errore
    DEMO_GENERATING --> FAILED: errore
    SCREENSHOT_GENERATING --> FAILED: errore<br/>nessun invio dipendente parte §10.1
    MESSAGE_GENERATING --> FAILED: errore
    SENDING --> FAILED: errore
    FAILED --> IDLE: retry/ripresa<br/>step fallito non corrompe pipeline §1
```

Proprietà garantite (§1 "Stateful & event-driven"): ogni fase salva stato e risultato; uno step fallito (processing `FAILED`) non altera il business status né corrompe la pipeline; la ripresa avviene tramite retry del job.

## 5. Job Orchestrator e job model (§15.1)

### 5.1 Modello dati job (§15.1 — campi obbligatori minimi)

`automation_jobs`: `id`, `job_type`, `entity_type`, `entity_id`, `status`, `priority`, `attempt_count`, `max_attempts`, `next_retry_at`, `lease_owner`, `lease_expires_at`, `idempotency_key UNIQUE`, `input_snapshot JSONB`, `result JSONB`, `error_code`, `error_detail`, `created_at`, `started_at`, `completed_at`. Audit tecnico su `automation_job_events` (§16.1).

### 5.2 Lifecycle con lease atomici

I lease/lock sono **atomici a livello database** per impedire doppia elaborazione (§15.1). Il claim avviene con un `UPDATE ... WHERE status='QUEUED' AND (lease_expires_at IS NULL OR lease_expires_at < now()) RETURNING` (transazione unica), oppure tramite `POST /api/jobs/claim` (§17).

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker runner
    participant DB as Supabase (automation_jobs)
    participant P as Provider Adapter

    W->>DB: claim: UPDATE atomico SET lease_owner, lease_expires_at,<br/>status=RUNNING WHERE QUEUED + lease scaduto/assente
    DB-->>W: job (1 solo) o nessuno
    W->>DB: verifica idempotency_key UNIQUE<br/>(già completato → skip)
    W->>P: esegui con input_snapshot
    alt successo
        P-->>W: risultato normalizzato
        W->>DB: POST /api/jobs/:id/complete<br/>status=COMPLETED, result, completed_at
    else errore recuperabile
        P-->>W: error_code
        W->>DB: POST /api/jobs/:id/fail<br/>attempt_count+1, next_retry_at=now+backoff<br/>status=QUEUED se attempt_count < max_attempts
    else errore definitivo / max_attempts
        W->>DB: status=FAILED, error_code/error_detail<br/>processing_status entità = FAILED
    end
    Note over W,DB: lease scaduto senza complete →<br/>job ri-clamabile da altro worker (recovery)
```

### 5.3 Proprietà della coda

- **Idempotenza**: `idempotency_key UNIQUE` (es. `job_type + entity_id + policy_version/sequence_step`); nessun duplicato di send per `campaign_lead + sequence_step` (§11.2 Idempotency).
- **Retry con backoff**: `next_retry_at` crescente fino a `max_attempts` (§10.1 step 9, §14 Timeout).
- **Dependency graph**: es. `SCREENSHOT_DESKTOP` dipende da demo `PUBLISHED` (§10.1); i send dipendenti da screenshot non partono se la cattura fallisce (§10.1 step 9).
- **Cancellation**: cancellazione atomica dei follow-up pendenti su reply (§12.2); job sospesi su campaign paused (§12.2).
- **Job ownership**: il backend assegna il browser job e Supabase conserva lo stato ufficiale (§14).

## 6. Provider abstraction (§14, §11.2)

Tutti i provider esterni implementano interfacce stabili in `lib/providers/`, ciascuno con **mock/test mode** obbligatorio (§22.3, §23.1). Le API key non arrivano mai al client (§11.2, §18 Secrets).

```mermaid
classDiagram
    class GooglePlacesProvider {
        <<interface>>
        +searchMinimal(query) LeadRaw[]
        +enrich(placeId) LeadEnrichment
    }
    class AIProvider {
        <<interface>>
        +scoreInputs(audit) ScoreSignals
        +personalize(template, lead) DraftData
    }
    class BrowserWorkerProvider {
        <<interface>>
        +analyzeWebsite(url) AnalysisResult §14.1
        +captureScreenshot(url, viewport) AssetRef
    }
    class ResendProvider {
        <<interface>>
        +send(message) ProviderMessageId
        +verifyWebhook(signature, payload) Event
    }
    GooglePlacesProvider <|.. GooglePlacesLive
    GooglePlacesProvider <|.. GooglePlacesMock
    AIProvider <|.. AIProviderMock
    BrowserWorkerProvider <|.. KimiWebBridgeAdapter : provider iniziale §14
    BrowserWorkerProvider <|.. BrowserWorkerMock
    BrowserWorkerProvider <|.. PlaywrightAdapter : backlog §25, fuori V1
    ResendProvider <|.. ResendLive
    ResendProvider <|.. ResendMock
```

**Regole (§14):** job ownership al backend; result contract JSON normalizzato + evidenze + error code; timeout + retry policy per job; interfaccia sostituibile (fallback Playwright è backlog §25); no hidden state nella sessione WebBridge.

**Website analysis result contract (§14.1):** URL finale + redirect chain; email/telefoni pubblici; social links; CTA principali; pagine chiave; segnali responsive/mobile; `issues[]` (type, severity, evidence, confidence); `opportunities[]`; riferimenti a screenshot/evidenze.

**Discovery two-step (§13.1):** discovery minimo (solo campi necessari al bacino) → enrichment (campi aggiuntivi solo sui candidati da approfondire). Persistenza `google_place_id` come identificatore forte + `google_last_enriched_at`. Deduplica §13.2 con ordine segnali: `google_place_id` UNIQUE per workspace → `normalized_domain` → `normalized_phone` → `normalized_email` → fuzzy name + distanza geografica solo come segnale (mai merge automatico su solo fuzzy).

## 7. Policy Engine e policy snapshot (§4, §4.1, §5.2)

Le tre modalità (MANUAL / SCORE_BASED / FULL_AUTO) sono **configurazioni runtime di un unico Policy Engine**, non rami di codice (§1 Policy-driven). Ogni azione è configurabile separatamente (§4.1): discovery, enrichment, website analysis, demo generation, screenshot, message generation, send, follow-up — ciascuna con modalità auto / score threshold / manual / off come da spec. Policy definibili a livello **workspace** con override a livello **campaign/category** (§4.1).

**Il Policy Engine decide, non lo Score Engine** (§5.2). Regola decisionale di riferimento: `opportunity_score >= 85 AND data_confidence >= 85 AND contactability >= 80 AND valid_email = true AND business_status = active` → solo allora una policy Score-Based può autorizzare il send automatico. Le soglie non sono hardcoded (§23.1): sono configurazione di policy.

```mermaid
flowchart TD
    CFG[Policy workspace<br/>default §4.1] --> RES[Policy resolver<br/>override campaign/category]
    OVR[Policy campaign/category] --> RES
    RES --> SNAP[Policy snapshot immutabile<br/>campaign_policy_versions §16.1]
    SNAP -->|salvata su| CL[campaign_lead]
    SNAP -->|salvata su| JOB[automation_jobs.input_snapshot]
    CL --> EVAL[Valutazione azione]
    JOB --> EVAL
    INPUT[Score breakdown + confidence<br/>+ stato lead/campagna/demo] --> EVAL
    EVAL -->|condizioni soddisfatte| AUTO[Esecuzione automatica]
    EVAL -->|fascia intermedia| RQ[Review Queue §8.2]
    EVAL -->|condizioni non soddisfatte| BLOCK[Bloccato / attesa manuale]
```

> **POLICY SNAPSHOT (§4.1):** ogni `campaign_lead`/job salva la versione della policy applicata. Una modifica futura della policy **non** cambia retroattivamente il comportamento dei job già materializzati.

Safe-by-default (§1): nuove campagne partono Manual o Score-Based; Full Auto è scelta esplicita dell'owner (onboarding step 6 §6.2; conferma esplicita per Full Auto/bulk send §8.1 step 9). Full Auto elimina il click di approvazione, **non** la verificabilità: preview, rate limit, Send Guard, suppression e kill switch restano attivi (§4, §7.3).

## 8. Send Guard (§11.2)

Send Guard è l'unico gate di emissione, eseguito **server-side prima di ogni send** (incluso Full Auto). Tutti i check devono passare:

| Check | Requirement (§11.2) |
|---|---|
| Recipient | email presente/valida e non suppressed |
| Lead | stato compatibile e nessuna reply che blocchi il flusso |
| Campaign | attiva, non paused, rate limit disponibile |
| Policy | condizioni soddisfatte con policy snapshot valida |
| Message | draft/version pronta e non vuota |
| Demo | se richiesta, demo e screenshot READY |
| Idempotency | nessun duplicato per campaign_lead + sequence_step |

```mermaid
sequenceDiagram
    participant TR as Trigger (API / Worker / FullAuto)
    participant SG as Send Guard (Domain Service)
    participant DB as Supabase
    participant RS as ResendProvider

    TR->>SG: richiesta send(messageId)
    SG->>DB: check Recipient (email valida, non in suppression_list)
    SG->>DB: check Lead (business_status compatibile, no reply bloccante)
    SG->>DB: check Campaign (attiva, non paused, rate limit §18)
    SG->>DB: check Policy (snapshot campaign_lead, condizioni soddisfatte)
    SG->>DB: check Message (draft/version pronta e non vuota)
    SG->>DB: check Demo (demo + screenshot READY se richiesti §10.1)
    SG->>DB: check Idempotency (campaign_lead + sequence_step unico)
    alt tutti i check passano
        SG->>RS: send (server-side, key mai al client)
        RS-->>SG: provider_message_id
        SG->>DB: messages (snapshot immutabile §11), message_events,<br/>activity_log + Decision Trace §19.1
    else un check fallisce
        SG-->>TR: rifiuto con motivo (audit in activity_log)
    end
```

Messaging versioning (§11): master template versionato (mai alterato dalla personalizzazione) → personalized draft (snapshot per lead, variabili risolte) → manual override (non aggiorna il master) → sent message (snapshot immutabile). Follow-up (§12.2): no reply entro N giorni → step successivo se eleggibile; reply → cancel atomico follow-up; hard bounce / unsubscribe / stop request → suppression + stop; campaign paused → nessun nuovo send, job sospesi.

## 9. Demo Engine, URL pattern e screenshot pipeline (§10, §10.1)

### 9.1 URL pattern (§10)

Una sola applicazione Vercel per tutte le demo. Pattern: `https://demo.<dominio>/d/<slug-leggibile>-<short-id>`

Requisiti: slug leggibile ma ID interno separato; demo disattivabile e scadibile; cache controllata con invalidazione su publish; header/meta `noindex,nofollow` per demo prospect; nessuna enumerazione sequenziale banale (short-id non predicibile); asset e screenshot in Supabase Storage; URL copiabile dalla dashboard.

Template model (§9): `website_templates` (identità logica) → `website_template_versions` (schema, layout key, component version, default content) → `demo_sites` (istanza per lead) → `demo_versions` (snapshot dati per revisione/pubblicazione) → `demo_assets` (logo, hero, gallery, screenshot, provenance). L'AI personalizza i **dati**, non riscrive layout/CSS (§9). Editor: save draft / publish version / restore / regenerate selected field — mai rigenerazione distruttiva dell'intera demo per una frase (§9.2).

### 9.2 Screenshot pipeline (§10.1)

```mermaid
flowchart TD
    P[Demo = PUBLISHED] --> Q1[Enqueue SCREENSHOT_DESKTOP]
    Q1 --> W1[Browser Worker apre URL<br/>attende readiness marker]
    W1 --> C1[Cattura desktop<br/>viewport standard]
    C1 --> Q2[Enqueue SCREENSHOT_MOBILE]
    Q2 --> C2[Cattura mobile]
    C2 --> UP[Upload Supabase Storage]
    UP --> UPD[Aggiorna demo_assets<br/>e campaign_lead]
    C1 -.->|fallimento| R[Retry con backoff §15.1]
    C2 -.->|fallimento| R
    R -.->|esaurito| FAIL[FAILED:<br/>nessun invio dipendente può partire]
```

## 10. Decision Trace e osservabilità (§19.1)

Per **ogni invio** deve essere possibile ricostruire la catena completa. Sorgenti: `activity_log` (append-only, §16.4) + snapshot nelle tabelle di dominio.

```mermaid
flowchart LR
    LS[lead source<br/>lead_sources] --> DT[Decision Trace per send]
    DU[dati usati<br/>input_snapshot] --> DT
    WA[website audit version<br/>website_audits] --> DT
    SB[score breakdown +<br/>algorithm_version<br/>lead_scores §5.1] --> DT
    PV[policy version +<br/>condizioni soddisfatte<br/>campaign_policy_versions] --> DT
    DV[demo/template/version<br/>demo_versions] --> DT
    MV[message template/draft/version] --> DT
    SGR[Send Guard result] --> DT
    PMID[provider message ID<br/>messages] --> DT
    WH[webhook events<br/>message_events] --> DT
```

Analytics (§20) con drill-down **categoria → campagna → template → score band** sui funnel: discovery, qualification, demo, outreach, engagement, commercial, optimization.

## 11. Kill switch (§19.2)

| Controllo | Effetto | Livello di enforcement |
|---|---|---|
| PAUSE ALL OUTREACH | blocca immediatamente nuovi send e follow-up | check in Send Guard + gate enqueue follow-up |
| Pause Campaign | blocca solo la campagna | check Campaign in Send Guard; job sospesi (§12.2) |
| Pause Discovery | ferma nuovi job Google | gate enqueue job discovery |
| Pause Browser Workers | ferma analisi/screenshot | gate enqueue job BrowserWorkerProvider |
| Disable Provider | impedisce nuove call al provider selezionato | gate nel provider adapter |

Il kill switch globale deve essere **sempre raggiungibile dalla dashboard** (§19.2) ed è testato nella DoD (§22.3). I flag vivono in configurazione workspace/feature flags (migration 0009 §16.3), letti a ogni decisione — mai cachetti permanenti che impediscano l'effetto immediato del PAUSE ALL.

## 12. Sicurezza e compliance (§16.4, §18)

- **RLS**: tutte le tabelle tenant-owned filtrano per `workspace_id`; service role solo server-side; ruoli Owner/Admin (write completo nel workspace), Operator (lead/campaign operations senza secrets), Viewer (read-only); `activity_log` append-only dal domain layer (niente update/delete ordinario).
- **Secrets**: solo env/secret store server-side; API key mai al client (§11.2).
- **Rate limits**: per workspace, campaign e provider.
- **Suppression**: hard bounce, unsubscribe e stop request bloccano invii successivi.
- **Domain reputation**: dominio/subdominio outreach dedicato e autenticato.
- **Data minimization & retention**: solo dati pubblici/necessari; retention configurabile per lead non utilizzati e audit. Nessuna assunzione legale hardcoded nel motore: retention, suppression e policy operative sono configurabili (§18).
- **Webhooks**: verifica firma/provider + idempotenza evento (§17 `POST /api/webhooks/resend`).
- **Demo privacy**: noindex e URL non enumerabile (§10).
- **Migrazioni**: incrementali, versionate nel repo, ripetibili; nessuna modifica manuale non tracciata (§16). Poiché il repo è vuoto, si adotta la sequenza 0001–0010 di §16.3 senza rinumerazione.

## 13. API surface (§17)

Route sottili in `app/api/`, logica nei Domain Services:

`POST /api/discovery/runs` · `GET /api/leads` · `GET /api/leads/:id` · `POST /api/leads/:id/enrich` · `POST /api/leads/:id/analyze` · `POST /api/leads/:id/score` · `POST /api/demos` · `PATCH /api/demos/:id` · `POST /api/demos/:id/publish` · `POST /api/demos/:id/screenshots` · `POST /api/campaigns` · `POST /api/campaigns/:id/activate` · `POST /api/messages/drafts/:id/test` · `POST /api/messages/drafts/:id/approve` · `POST /api/messages/:id/send` · `POST /api/webhooks/resend` · `POST /api/jobs/claim` · `POST /api/jobs/:id/complete` · `POST /api/jobs/:id/fail`

## 14. Struttura cartelle proposta (monorepo Next.js)

Struttura derivata dai layer §15, dalle migrazioni §16.3 e dalla DoD §22.3. Nessun framework extra rispetto allo stack congelato §24.

```
sales-automation-os/
├── app/                              # Next.js App Router — layer "Next.js Web" §15
│   ├── (dashboard)/                  # route group autenticato
│   │   ├── overview/                 # §6.1 Overview
│   │   ├── leads/                    # list + [id] detail con tab §7.2
│   │   ├── segments/                 # §5.3
│   │   ├── campaigns/                # wizard §8.1
│   │   ├── review-queue/             # §8.2
│   │   ├── demos/                    # §6.1 Demos
│   │   ├── templates/                # landing + message, versioni §9/§11
│   │   ├── inbox/                    # §12.1
│   │   ├── automations/              # policy, follow-up, job status
│   │   ├── analytics/                # §20
│   │   ├── settings/                 # provider, domini, API, utenti, sicurezza
│   │   └── onboarding/               # wizard §6.2
│   ├── d/[slug]/                     # route demo pubblica §10 (noindex,nofollow)
│   └── api/                          # BFF sottile §17
│       ├── discovery/runs/
│       ├── leads/  + [id]/{enrich,analyze,score}/
│       ├── demos/  + [id]/{publish,screenshots}/
│       ├── campaigns/ + [id]/activate/
│       ├── messages/ + drafts/[id]/{test,approve}/ + [id]/send/
│       ├── webhooks/resend/
│       └── jobs/{claim,[id]/complete,[id]/fail}/
├── lib/
│   ├── domain/                       # Domain Services §15 — logica di business
│   │   ├── leads/                    # dedupe §13.2, normalizzazione
│   │   ├── scoring/                  # score engine §5.1 (breakdown, algorithm_version)
│   │   ├── policy/                   # policy engine §4.1 + resolver + snapshot
│   │   ├── templates/                # registry master/versioni §9, §11
│   │   ├── demos/                    # demo lifecycle §9/§10
│   │   ├── campaigns/                # campaign + review queue §8
│   │   ├── messaging/                # drafts, versioning §11, Send Guard §11.2
│   │   ├── followup/                 # sequenze + cancellation §12.2
│   │   ├── suppression/              # suppression list §12.2/§18
│   │   └── audit/                    # activity_log append-only + Decision Trace §19.1
│   ├── jobs/                         # Job Orchestrator §15.1
│   │   ├── queue.ts                  # enqueue con idempotency_key
│   │   ├── lease.ts                  # claim atomico DB
│   │   ├── retry.ts                  # backoff/next_retry_at
│   │   ├── dependencies.ts           # dependency graph (es. screenshot ← publish)
│   │   ├── cancellation.ts           # cancel atomico follow-up, pause
│   │   └── worker.ts                 # runner claim/execute/complete/fail
│   ├── providers/                    # Provider Adapters §14 — interfacce + mock
│   │   ├── google-places/            # interface + live + mock §13
│   │   ├── browser-worker/           # BrowserWorkerProvider + kimi-webbridge + mock §14
│   │   ├── resend/                   # interface + live + mock §11.2
│   │   └── ai/                       # AIProvider + mock (confidence, personalizzazione)
│   ├── supabase/                     # client server-side (service role) + typed repositories
│   └── config/                       # feature flags, kill switch §19.2, env validation
├── supabase/
│   └── migrations/                   # 0001_core_workspace_auth … 0010_seed_baseline §16.3
├── tests/
│   ├── unit/                         # scoring, policy, Send Guard, dedupe, template vars §22.2
│   ├── integration/                  # repositories, job lifecycle, webhook idempotency
│   ├── e2e/                          # onboarding, discovery fake, preview, campaign, manual
│   │                                 # approval, full-auto dry run §22.2
│   ├── security/                     # RLS, secret exposure, cross-workspace access
│   └── regression/                   # template rendering desktop/mobile, message preview
├── docs/                             # MASTER_SPEC, CURRENT_STATE_AUDIT, ARCHITECTURE, …
└── package.json / tsconfig.json / next.config.* / README.md
```

Note vincolanti:

- `lib/providers/*` espone solo interfacce al dominio; le implementazioni live si attivano solo con credenziali presenti, altrimenti mock/test mode (§22.3).
- `app/d/[slug]/` è nella stessa app Vercel della dashboard (§10: una sola applicazione Vercel), con rendering guidato da `demo_versions` pubblicate.
- Nessun secret in `app/` client component; tutte le chiamate provider passano da Domain Services server-side (§18).

## 15. Allineamento alla Definition of Done (§22.3)

L'architettura è progettata per rendere dimostrabili: fresh clone → install → migrations → seed → run; RLS testata; demo route su seed template; override messaggio senza toccare il master; policy Manual/Score-Based/Full Auto testate; job retry/idempotency; adapter Resend/Google/BrowserWorker con mock; kill switch globale; documentazione aggiornata. Seed §22.1 (5 categorie, 2 landing template, 2 message template + 1 follow-up sequence, 20 lead fake, eventi email fake, nessun dato reale/secret) è parte della migration 0010 (§16.3) e alimenta gli E2E §22.2.
