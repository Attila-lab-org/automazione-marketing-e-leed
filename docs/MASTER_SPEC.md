# SALES AUTOMATION OS — MASTER EXECUTION SPECIFICATION

**Destinazione:** Kimi K3 Agent Swarm  
**Versione:** 1.0  
**Obiettivo:** costruire una piattaforma enterprise per discovery, qualificazione, demo, preview, outreach e follow-up di lead locali.

> PRINCIPIO BASE: prima si costruisce il bacino lead, poi si segmenta per categoria e punteggio, quindi si attivano campagne e invii. La preview di demo e messaggio resta sempre disponibile anche in Full Auto.

## Mandato a Kimi Swarm

Implementare il sistema in modo modulare, verificabile e production-oriented. Non inventare flussi commerciali, non accoppiare il core a un singolo provider, non effettuare deploy distruttivi e non sostituire le policy definite in questo documento con scorciatoie hardcoded.

Il primo output dello Swarm deve essere un **CURRENT STATE AUDIT** del repository reale. Solo dopo deve iniziare l'implementazione. Se una funzione, tabella, route o componente esiste già, va riutilizzato o rifattorizzato: non duplicato.

# 1. Executive intent e principi non negoziabili

La piattaforma deve operare come un **Sales Automation Operating System**. Il lead è l'oggetto centrale. Tutto il resto — audit, score, demo, screenshot, messaggi, campagne, reply, follow-up e conversione — deve essere collegato al lead e tracciato.

| Principio | Requisito non negoziabile |
|---|---|
| Lead-first | Nessun invio durante il discovery. Prima si costruisce e qualifica il bacino lead. |
| Preview sempre disponibile | Demo e messaggio devono essere consultabili anche in Full Auto. |
| Policy-driven | Manuale, Score-Based e Full Auto sono configurazioni runtime, non rami di codice separati. |
| Stateful & event-driven | Ogni fase salva stato e risultato. Uno step fallito non deve corrompere la pipeline. |
| Provider abstraction | Google, Kimi/WebBridge, Resend e AI provider devono essere sostituibili tramite adapter. |
| Auditability | Ogni decisione automatica deve essere spiegabile e ricostruibile. |
| Safe-by-default | Nuove campagne partono Manual o Score-Based; Full Auto è una scelta esplicita dell'owner. |
| Enterprise UX | Ridurre click, usare progressive disclosure, bulk actions, saved filters e onboarding guidato. |

# 2. Scope V1 e outcome

## 2.1 Outcome V1

- Scoprire lead locali con Google Places API.
- Normalizzare, deduplicare, categorizzare e assegnare punteggio ai lead.
- Analizzare il sito pubblico del lead tramite Browser Worker.
- Generare demo da template versionato con URL dinamico su Vercel.
- Generare screenshot desktop/mobile e renderli visibili in dashboard.
- Generare messaggi da template, completamente modificabili quando la policy prevede revisione.
- Segmentare per categoria, punteggio, confidence, territorio e altri filtri.
- Permettere modalità Manual, Score-Based e Full Auto.
- Inviare via Resend con guard server-side, eventi, reply, suppression e follow-up.
- Mostrare timeline e Decision Trace per ogni lead.

## 2.2 Out-of-scope iniziale

- Page builder libero stile Webflow: V1 usa template strutturati e campi configurabili.
- CRM completo di fatturazione/contratti/customer success.
- Machine learning proprietario: V1 usa scoring deterministico + AI confidence.
- Automazioni invasive su social/direct non supportate ufficialmente dalle piattaforme.
- Multi-tenant SaaS commerciale completo: progettare workspace-ready, ma V1 può operare con un solo workspace owner.

# 3. User journey e pipeline lead-first

La piattaforma deve separare nettamente acquisizione e outreach.

| Fase | Input | Output | Gate |
|---|---|---|---|
| Discovery | Categoria + area + filtri | Lead grezzi | Mai invio |
| Enrichment | Lead grezzo | Sito, telefono, contatti pubblici, dati | Mai invio |
| Website Analysis | Sito | Problemi, evidenze, opportunità | Mai invio |
| Scoring | Dati + audit | Score + confidence + motivazioni | Mai invio |
| Segmentation | Lead qualificati | Segmento selezionabile | Owner decide campagna |
| Demo | Lead + template | Demo + preview + screenshot | Policy |
| Message | Lead + template messaggio | Bozza editabile + preview | Policy |
| Send | Messaggio pronto | Email inviata | Send Guard server-side |
| Follow-up | Nessuna reply | Step successivo | Stop su reply/suppression |

## 3.1 Stati separati

Non usare un singolo status per tutto.

**Business status:** NEW, QUALIFIED, CAMPAIGN_READY, CONTACTED, REPLIED, INTERESTED, WON, LOST, NOT_INTERESTED, SUPPRESSED.

**Processing status:** IDLE, ENRICHING, ANALYZING, SCORING, DEMO_GENERATING, SCREENSHOT_GENERATING, MESSAGE_GENERATING, SENDING, FAILED.

# 4. Modalità operativa: Manual / Score-Based / Full Auto

| Modalità | Comportamento | Uso |
|---|---|---|
| MANUAL | Demo e messaggio possono essere generati automaticamente, ma l'invio richiede approvazione. | Campagne nuove / categorie non validate |
| SCORE_BASED | I gate si aprono solo quando score e confidence rispettano soglie definite. Fascia intermedia va in Review Queue. | Modalità standard consigliata |
| FULL_AUTO | Pipeline completa senza blocchi manuali, ma con preview, rate limit, Send Guard, suppression e kill switch. | Segmenti già validati |

## 4.1 Policy granulari

Ogni azione deve essere configurabile separatamente:

- Discovery: auto/manual.
- Enrichment: auto/manual.
- Website analysis: auto/manual.
- Demo generation: auto / score threshold / manual.
- Screenshot: auto/manual.
- Message generation: auto/manual.
- Send: manual / score threshold / full auto.
- Follow-up: off / manual / auto.

Le policy devono poter essere definite a livello workspace e sovrascritte a livello campaign/category.

> POLICY SNAPSHOT: ogni campaign_lead/job deve salvare la versione della policy applicata. Una modifica futura della policy non deve cambiare retroattivamente il comportamento dei job già materializzati.

# 5. Scoring, segmentazione e categorie

## 5.1 Score composito

| Dimensione | Esempi | Output |
|---|---|---|
| Opportunity | sito obsoleto, UX mobile, CTA, qualità visuale, performance percepita | 0-100 |
| Contactability | email disponibile/valida, telefono, sito attivo | 0-100 |
| Data confidence | coerenza fonti, dati completi, business status | 0-100 |
| Template match | compatibilità con template disponibili per categoria | 0-100 |
| Business potential | rating, review count, categoria, segnali di attività | 0-100 |

Lo score finale deve essere spiegabile e versionato. Salvare breakdown, confidence, motivazioni sintetiche e algorithm_version. Non accettare un singolo numero generato dall'AI senza evidenze.

## 5.2 Regola decisionale consigliata

Il Policy Engine decide, non lo Score Engine.

Esempio:

- opportunity_score >= 85
- data_confidence >= 85
- contactability >= 80
- valid_email = true
- business_status = active

Solo allora una policy Score-Based può autorizzare il send automatico.

## 5.3 Segmentazione

L'owner deve poter filtrare e salvare segmenti per:

- categoria/sottocategoria;
- regione, provincia, città, raggio;
- score range e confidence minima;
- con/senza sito;
- sito analizzato/non analizzato;
- email presente/assente;
- template match minimo;
- rating/review count;
- business status/processing status;
- campagna assegnata/non assegnata;
- tag custom.

Il flusso corretto è: **Trova lead → Qualifica → Salva segmento → Crea campagna → Genera demo/messaggi → Invia secondo policy.**

# 6. Dashboard enterprise e onboarding

La dashboard deve essere enterprise ma semplice. Un utente non tecnico deve capire in pochi minuti:

- quanti lead abbiamo;
- quali categorie performano meglio;
- quali lead sono pronti;
- cosa richiede attenzione;
- cosa è in automatico;
- cosa è bloccato;
- dove vedere una preview;
- come fermare gli invii.

## 6.1 Navigazione principale

| Voce | Funzione primaria |
|---|---|
| Overview | KPI, alert, pipeline, attività recenti, stato sistemi |
| Leads | database, filtri, bulk actions, dettaglio lead |
| Segments | segmenti salvati per categoria/score/territorio |
| Campaigns | creazione, policy, stato, risultati |
| Review Queue | approvazioni rapide di demo/messaggi/invii |
| Demos | istanze demo, preview, screenshot, stato |
| Templates | landing e message template, versioni |
| Inbox | reply e conversazioni |
| Automations | policy, follow-up, job status |
| Analytics | conversioni e performance |
| Settings | provider, domini, API, utenti, sicurezza |

## 6.2 Onboarding guidato

1. Welcome: spiegazione sintetica “Trova → Qualifica → Demo → Contatta”.
2. Collega Google Places API e verifica credenziali.
3. Collega Resend, dominio mittente e webhook.
4. Verifica Supabase Storage/bucket.
5. Seleziona categorie e territori iniziali.
6. Scegli modalità predefinita: Manual o Score-Based. Full Auto non deve essere pre-selezionato.
7. Configura soglie score/confidence.
8. Seleziona template iniziali.
9. Esegui Test Run su pochi lead senza invio.
10. Mostra checklist finale con stato verde/ambra/rosso e link diretto per correggere.

**UX RULE:** le configurazioni avanzate devono stare dietro “Advanced settings”. Le schermate principali mostrano solo ciò che serve per prendere una decisione operativa.

# 7. Lead Center e preview

## 7.1 Lead list

- Data table enterprise con colonne configurabili.
- Filtri persistenti e saved views.
- Bulk select + azioni contestuali.
- Badge categoria, score, confidence, email, sito, demo, campaign status.
- Quick preview drawer senza cambiare pagina.
- Ricerca per nome, dominio, email, telefono, città e Google Place ID.

## 7.2 Lead detail

| Tab | Contenuto |
|---|---|
| Overview | dati azienda, contatti, score breakdown, campagna, quick actions |
| Audit | analisi sito, evidenze, problemi, opportunità |
| Demo | preview live desktop/mobile, editor dati, screenshot |
| Messages | draft, editor, preview, storico inviati |
| Timeline | eventi tecnici/commerciali e Decision Trace |

## 7.3 Preview obbligatoria

La preview deve esistere sempre, indipendentemente dalla policy.

- Preview demo live Desktop/Mobile.
- Preview screenshot finale che sarà usato nell'email.
- Preview messaggio con variabili già risolte.
- Indicazione template/versione.
- Indicazione policy che autorizzerebbe l'invio.
- Open public demo.
- Copy demo URL.

Full Auto elimina il click di approvazione, non la possibilità di verificare cosa sta facendo il sistema.

# 8. Campaign Center e Review Queue

## 8.1 Creazione campagna

1. Seleziona segmento o filtri.
2. Mostra conteggio lead e campione di anteprima.
3. Scegli landing template.
4. Scegli message template.
5. Scegli follow-up sequence.
6. Configura Manual / Score-Based / Full Auto.
7. Definisci soglie, rate limit, finestra oraria e limite giornaliero.
8. Mostra simulazione degli effetti prima dell'attivazione.
9. Richiedi conferma esplicita per attivare Full Auto o bulk send.

## 8.2 Review Queue

La Review Queue deve consentire di validare molti lead rapidamente.

Ogni card mostra:

- azienda, categoria, città;
- score e confidence;
- thumbnail demo;
- oggetto e preview messaggio;
- segnali chiave: email valida, audit, template match;
- azioni: Approve, Edit, Skip, Reject, Pause Lead.

Aggiungere bulk approve solo con conferma esplicita e conteggio dei record coinvolti.

# 9. Template Engine per landing demo

L'AI personalizza i dati. Non deve riscrivere arbitrariamente il layout o il CSS.

| Oggetto | Responsabilità |
|---|---|
| website_templates | identità logica del template |
| website_template_versions | schema, layout key, component version, default content |
| demo_sites | istanza collegata al lead |
| demo_versions | snapshot dei dati usati in una revisione/pubblicazione |
| demo_assets | logo, hero, gallery, screenshot, provenance |

## 9.1 Campi configurabili minimi

- business_name;
- logo;
- palette;
- hero title/subtitle/image;
- about_text;
- services/products;
- highlights;
- gallery;
- phone/email/address/opening hours;
- social links;
- primary CTA e secondary CTA;
- visibility toggle per sezione.

## 9.2 Editor demo

- Sidebar edit + preview live.
- Desktop/Mobile toggle.
- Save Draft.
- Publish Version.
- Restore Previous Version.
- Regenerate selected field with AI.
- Non rigenerare distruttivamente l'intera demo per cambiare una singola frase.
- Asset manager con origine/provenance registrata.

# 10. Demo Engine, URL, asset e screenshot

Usare una sola applicazione Vercel per tutte le demo.

**URL pattern consigliato:** `https://demo.<dominio>/d/<slug-leggibile>-<short-id>`

Requisiti:

- slug leggibile, ma ID interno separato;
- demo disattivabile e scadibile;
- cache controllata e invalidazione su publish;
- `noindex,nofollow` per demo prospect;
- nessuna enumerazione sequenziale banale;
- asset e screenshot in Supabase Storage;
- URL demo copiabile dalla dashboard.

## 10.1 Screenshot pipeline

1. Demo = PUBLISHED.
2. Enqueue `SCREENSHOT_DESKTOP`.
3. Browser Worker apre URL e attende readiness marker.
4. Cattura desktop a viewport standard.
5. Enqueue `SCREENSHOT_MOBILE`.
6. Cattura mobile.
7. Upload Storage.
8. Aggiorna demo_assets e campaign_lead.
9. Se fallisce: retry con backoff; nessun invio dipendente può partire.

# 11. Messaging Engine, editor e versioning

Il messaggio deve essere modificabile dall'owner quando esiste un gate umano. In Full Auto lo stesso draft/versione resta consultabile.

| Livello | Regola |
|---|---|
| Master template | Versionato e non alterato dalla personalizzazione del singolo lead |
| Personalized draft | Snapshot generato per lead con variabili risolte |
| Manual override | Modifica locale che non aggiorna il master |
| Sent message | Snapshot immutabile del contenuto realmente inviato |

## 11.1 Message editor UX

- Subject field.
- Editor semplice con opzione avanzata.
- Token/variable picker.
- Preview destinatario con variabili risolte.
- Screenshot demo incorporabile.
- Demo URL e CTA.
- AI actions: Rewrite, Shorten, Change tone, Regenerate selected paragraph.
- Save Draft.
- Send Test to Owner.
- Approve & Schedule.
- Approve & Send.
- Indicazione visibile della policy corrente.

## 11.2 Resend provider

Resend deve essere integrato server-side tramite adapter. Le API key non devono mai arrivare al client.

Prima di ogni send eseguire **Send Guard**.

| Check | Requirement |
|---|---|
| Recipient | email presente/valida e non suppressed |
| Lead | stato compatibile e nessuna reply che blocchi il flusso |
| Campaign | attiva, non paused, rate limit disponibile |
| Policy | condizioni soddisfatte con policy snapshot valida |
| Message | draft/version pronta e non vuota |
| Demo | se richiesta, demo e screenshot READY |
| Idempotency | nessun duplicato per campaign_lead + sequence_step |

# 12. Inbox, reply handling e follow-up

## 12.1 Inbox

- Thread per lead/campagna.
- Filtri: unread, interested, needs reply, automated, archived.
- Risposta dalla dashboard.
- Collegamento diretto a lead, demo e timeline.
- AI summary e suggested reply opzionali.
- Nessun auto-send delle reply in V1 salvo futura policy dedicata.

## 12.2 Follow-up

| Evento | Azione |
|---|---|
| No reply entro N giorni | enqueue step successivo se ancora eleggibile |
| Reply ricevuta | cancel atomico di tutti i follow-up pendenti |
| Hard bounce | suppression + stop |
| Unsubscribe / stop request | suppression + stop globale per indirizzo |
| Campaign paused | nessun nuovo send; job restano sospesi |

# 13. Discovery con Google Places API

Google Places API è la sorgente strutturata primaria per discovery locale. Il discovery deve essere batch-oriented e separato dall'outreach.

## 13.1 Query model

Input configurabile:

- categoria;
- città/area;
- raggio;
- max risultati;
- business status;
- eventuali filtri aggiuntivi.

Usare un approccio a due passaggi:

1. **Discovery minimo**: richiedere solo i campi necessari a costruire il bacino.
2. **Enrichment**: richiedere campi aggiuntivi solo sui candidati da approfondire.

Persistenza `google_place_id` come identificatore forte e timestamp `google_last_enriched_at`.

## 13.2 Deduplica

Ordine segnali:

1. google_place_id UNIQUE per workspace;
2. normalized_domain;
3. normalized_phone;
4. normalized_email;
5. fuzzy name + distanza geografica solo come segnale; non effettuare merge definitivo automatico basato solo sul fuzzy match.

# 14. Kimi Work + WebBridge e Browser Worker abstraction

Kimi Work/WebBridge è il provider iniziale per analisi browser e screenshot. Il core non deve dipendere dalla sessione Kimi come system of record.

| Regola | Implementazione |
|---|---|
| Job ownership | il backend assegna il browser job; Supabase conserva lo stato ufficiale |
| Result contract | il worker restituisce JSON normalizzato + evidenze + error code |
| Timeout | ogni job ha scadenza e retry policy |
| Fallback | interfaccia BrowserWorkerProvider sostituibile con Playwright |
| No hidden state | nessuna informazione essenziale deve vivere solo nella sessione WebBridge |

## 14.1 Website analysis result contract

Il risultato normalizzato deve includere:

- URL finale e redirect chain;
- email pubbliche trovate;
- telefoni pubblici trovati;
- social links;
- CTA principali;
- pagine chiave trovate;
- segnali di responsive/mobile;
- problemi strutturati `issues[]` con type, severity, evidence, confidence;
- opportunità `opportunities[]`;
- eventuali riferimenti a screenshot/evidenze.

# 15. Architettura backend e job orchestration

Non concatenare Google → Kimi → AI → demo → screenshot → Resend in una singola HTTP request.

Usare job persistenti, idempotenti e riprendibili.

| Layer | Responsabilità |
|---|---|
| Next.js Web | dashboard, BFF/API, route demo |
| Domain Services | lead, scoring, policy, template, campaign, messaging |
| Job Orchestrator | enqueue, lease, retry, dependency graph, cancellation |
| Provider Adapters | Google, AI, Browser Worker, Resend |
| Supabase | system of record, storage, auth, audit |

## 15.1 Job model

Ogni job deve avere almeno:

- id;
- job_type;
- entity_type;
- entity_id;
- status;
- priority;
- attempt_count;
- max_attempts;
- next_retry_at;
- lease_owner;
- lease_expires_at;
- idempotency_key UNIQUE;
- input_snapshot JSONB;
- result JSONB;
- error_code;
- error_detail;
- created_at;
- started_at;
- completed_at.

Usare lease/lock atomici a livello database per impedire doppia elaborazione.

# 16. Modello dati Supabase e migrazioni

Le migrazioni devono essere incrementali, versionate nel repository e applicabili in modo ripetibile. Nessuna modifica manuale non tracciata allo schema production.

## 16.1 Tabelle principali

| Tabella | Scopo |
|---|---|
| workspaces | configurazione tenant e default policy |
| workspace_members | ruoli/accesso |
| provider_connections | stato provider e metadata configurazione |
| leads | master record azienda |
| lead_contacts | email/phone/person/contact source |
| lead_sources | provenance discovery/enrichment |
| website_audits | audit versionato e score inputs |
| lead_scores | breakdown, algorithm version, confidence |
| tags | tag dictionary |
| lead_tags | many-to-many |
| segments | saved filter definitions |
| website_templates | master template |
| website_template_versions | snapshot/versione |
| demo_sites | istanza demo |
| demo_versions | snapshot demo |
| demo_assets | logo/images/screenshots |
| message_templates | master messaggio |
| message_template_versions | versioni |
| message_drafts | bozze personalizzate |
| campaigns | configurazione campagna |
| campaign_leads | membership, state, policy snapshot |
| campaign_policy_versions | policy immutabili/versionate |
| followup_sequences | sequenze master |
| followup_sequence_versions | versioni |
| message_threads | thread lead/campagna |
| messages | sent/inbound snapshots |
| message_events | delivery/open/click/bounce/etc. |
| suppression_list | stop/bounce/unsubscribe |
| automation_jobs | coda persistente |
| automation_job_events | audit tecnico job |
| activity_log | timeline append-only e Decision Trace |

## 16.2 Colonne core — leads

- id uuid PK;
- workspace_id uuid FK;
- google_place_id text nullable;
- name text;
- category/subcategory;
- address/city/region/postal_code;
- lat/lng;
- website_url;
- normalized_domain;
- phone/email come convenience fields + righe in lead_contacts;
- business_status;
- processing_status;
- current_score;
- current_confidence;
- created_at/updated_at.

Vincolo: unique `(workspace_id, google_place_id)` quando `google_place_id` non è null.

## 16.3 Migrazioni iniziali consigliate

| Migration | Contenuto |
|---|---|
| 0001_core_workspace_auth | workspaces, members, enums, RLS base |
| 0002_leads_sources_contacts | leads, contacts, sources, dedupe indexes |
| 0003_audits_scores_segments | website_audits, lead_scores, tags, segments |
| 0004_templates_demos | template/version, demo/version/assets |
| 0005_campaigns_policies | campaigns, campaign_leads, policy versions |
| 0006_messaging | templates, drafts, threads, messages, events, suppression |
| 0007_automation_jobs | jobs, job events, leases, idempotency |
| 0008_activity_audit | activity log / decision trace |
| 0009_provider_settings | provider connection metadata, feature flags |
| 0010_seed_baseline | categorie/template/test data non-production |

Prima di applicare queste migration names, lo Swarm deve confrontarle con le migrazioni già presenti nel repository e rinumerare senza collisioni.

## 16.4 RLS e ruoli

- Tutte le tabelle tenant-owned filtrano per workspace_id.
- Service role solo server-side.
- Owner/Admin: write completo nel workspace.
- Operator: lead/campaign operations senza secrets.
- Viewer: read-only.
- Activity log append-only dal domain layer; niente update/delete ordinario.

# 17. API e service contracts

| Endpoint/Service | Intent |
|---|---|
| POST /api/discovery/runs | crea discovery run |
| GET /api/leads | list/filter/paginate |
| GET /api/leads/:id | lead aggregate detail |
| POST /api/leads/:id/enrich | enqueue enrichment |
| POST /api/leads/:id/analyze | enqueue website analysis |
| POST /api/leads/:id/score | recompute score |
| POST /api/demos | create demo instance |
| PATCH /api/demos/:id | update editable data |
| POST /api/demos/:id/publish | publish version |
| POST /api/demos/:id/screenshots | enqueue screenshots |
| POST /api/campaigns | create campaign |
| POST /api/campaigns/:id/activate | activate with validation |
| POST /api/messages/drafts/:id/test | send owner test |
| POST /api/messages/drafts/:id/approve | approve draft |
| POST /api/messages/:id/send | guarded send |
| POST /api/webhooks/resend | event/inbound handler |
| POST /api/jobs/claim | worker claim/lease |
| POST /api/jobs/:id/complete | worker result |
| POST /api/jobs/:id/fail | worker error |

Le API route devono essere sottili. La logica vive nei Domain Services.

# 18. Sicurezza, compliance e deliverability

| Area | Requirement |
|---|---|
| Secrets | solo server-side env/secret store |
| Rate limits | per workspace, campaign e provider |
| Suppression | hard bounce, unsubscribe e stop request bloccano invii successivi |
| Domain reputation | usare dominio/subdominio outreach dedicato e autenticato |
| Data minimization | conservare solo dati pubblici/necessari al processo |
| Retention | policy configurabile per lead non utilizzati e audit |
| Access control | RBAC + RLS |
| Webhooks | verifica firma/provider + idempotenza evento |
| Demo privacy | noindex e URL non enumerabile facilmente |

Non hardcodare assunzioni legali specifiche nel motore. Rendere configurabili retention, suppression e policy operative.

# 19. Osservabilità, audit trail e kill switch

## 19.1 Decision Trace

Per ogni invio deve essere possibile ricostruire:

- lead source;
- dati usati;
- website audit version;
- score breakdown e algorithm version;
- policy version e condizioni soddisfatte;
- demo/template/version;
- message template/draft/version;
- Send Guard result;
- provider message ID;
- webhook events.

## 19.2 Kill switches

| Controllo | Effetto |
|---|---|
| PAUSE ALL OUTREACH | blocca immediatamente nuovi send e follow-up |
| Pause Campaign | blocca solo la campagna |
| Pause Discovery | ferma nuovi job Google |
| Pause Browser Workers | ferma analisi/screenshot |
| Disable Provider | impedisce nuove call al provider selezionato |

Il kill switch globale deve essere sempre raggiungibile dalla dashboard.

# 20. Analytics e KPI

| Funnel | Metriche |
|---|---|
| Discovery | lead trovati, deduplicati, costo per lead scoperto |
| Qualification | % con sito, % email, score medio, qualified rate |
| Demo | generation success, time-to-demo, template distribution |
| Outreach | sent, delivered, bounce, reply, unsubscribe |
| Engagement | demo visits, click-through, repeat visits |
| Commercial | interested, won/lost, conversion by category/city/score |
| Optimization | performance per template/version/message/version/policy |

Analytics deve permettere drill-down **categoria → campagna → template → score band**.

# 21. UX component inventory

| Componente | Uso |
|---|---|
| AppShell | sidebar, topbar, breadcrumbs, global search |
| KPI Card | metriche con trend e drilldown |
| Smart Data Table | filtri, saved views, bulk actions |
| Score Badge | score + confidence + breakdown |
| Policy Badge | Manual / Score-Based / Full Auto |
| Lead Quick Drawer | preview rapida |
| Demo Preview | desktop/mobile + open public URL |
| Message Preview | contenuto risolto + screenshot/link |
| Review Card | approve/edit/reject rapido |
| Timeline | eventi business + tecnici |
| Decision Trace | perché il sistema ha agito |
| Provider Status | health/configuration |
| Empty State | spiega il prossimo passo |
| Danger Zone Modal | full auto, bulk send, delete, kill switch |

## 21.1 UX rules

- Nessun gergo tecnico necessario per operazioni normali.
- Ogni stato deve avere label leggibile e tooltip.
- Ogni errore deve proporre una next action.
- Preferire drawer/modal per quick edit, pagina completa per configurazioni complesse.
- Bulk actions con preview del numero di record coinvolti.
- Full Auto sempre accompagnato da badge visibile e kill switch.
- Mobile responsive per consultazione; configurazioni avanzate ottimizzate desktop.

# 22. Seed, test, QA e Definition of Done

## 22.1 Seed

- 5 categorie demo.
- 2 landing template per almeno una categoria prioritaria.
- 2 message template + 1 follow-up sequence.
- 20 lead fake realistici con differenti score/stati.
- Eventi email fake per Inbox/Analytics.
- Nessun dato reale o secret nel repository.

## 22.2 Test minimi

| Layer | Test |
|---|---|
| Unit | scoring, policy evaluation, Send Guard, dedupe, template variables |
| Integration | Supabase repositories, job lifecycle, webhook idempotency |
| E2E | onboarding, discovery fake, lead preview, campaign creation, manual approval, full-auto dry run |
| Security | RLS, secret exposure, unauthorized workspace access |
| Regression | template rendering desktop/mobile, message preview |

## 22.3 Definition of Done

- Fresh clone → install → migrations → seed → local run documentato.
- Nessun TypeScript error, lint blocker o test rosso.
- RLS applicata e testata.
- Demo route renderizza seed template.
- Message editor salva override senza modificare master template.
- Policy Manual/Score-Based/Full Auto dimostrata con test.
- Job retry/idempotency dimostrati.
- Resend adapter con mock/test mode se credenziali assenti.
- Google Places adapter con mock/test mode.
- BrowserWorkerProvider interface implementata.
- Kimi/WebBridge adapter documentato.
- Kill switch globale testato.
- README + ARCHITECTURE + DATABASE + OPERATIONS aggiornati.

# 23. Piano di implementazione per Kimi Swarm

| Fase | Workstream | Output |
|---|---|---|
| Phase 0 | Audit repo/current state | nessuna modifica distruttiva |
| Phase 1 | Foundation | Next.js shell, Supabase migrations, auth/RLS, types |
| Phase 2 | Lead domain | Google adapter mock/live, leads, dedupe, segments |
| Phase 3 | Scoring + policy | score engine, policy engine, snapshots |
| Phase 4 | Template + demo | template registry, versions, demo routes/editor |
| Phase 5 | Jobs + browser contract | queue, leases, BrowserWorkerProvider |
| Phase 6 | Messaging | draft editor, Resend adapter, Send Guard, events |
| Phase 7 | Campaign + review | wizard, Review Queue, bulk controls |
| Phase 8 | Inbox + follow-up | threads, inbound, cancellation |
| Phase 9 | Analytics + operations | KPI, health, audit, kill switch |
| Phase 10 | QA + hardening | E2E, security, docs, performance |

## 23.1 Regole operative per lo Swarm

- Prima leggere repository e documentazione esistente.
- Produrre un piano file-by-file prima delle modifiche principali.
- Usare migrazioni incrementali; mai reset DB come scorciatoia.
- Non cambiare stack senza motivazione tecnica documentata.
- Non implementare auto-send senza Send Guard, suppression e kill switch.
- Non hardcodare provider IDs, domini o score thresholds.
- Non inviare email reali durante test/seed.
- Ogni adapter esterno deve avere mock/test mode.
- Preservare versioning di template, demo, messaggi e policy.
- Chiudere ogni fase con test + report dei file modificati e rischi residui.

# 24. Decisioni congelate per V1

| Decisione | Baseline |
|---|---|
| Discovery primaria | Google Places API |
| System of Record | Supabase |
| Dashboard/Demo Runtime | Next.js su Vercel |
| Browser automation iniziale | Kimi Work + WebBridge tramite adapter |
| Email provider iniziale | Resend |
| Lead workflow | prima discovery/qualifica, poi segmentazione, poi campagne |
| Segmentazione | categoria + score + confidence + area + filtri |
| Preview | sempre disponibile, anche Full Auto |
| Message control | testo modificabile prima dell'invio nelle modalità con gate |
| Automation | Manual / Score-Based / Full Auto configurabile |
| Template model | master versionato + instance configurativa |
| Post-Swarm | refinement e modifiche chirurgiche in Cursor |

# 25. Backlog successivo

- Social/community discovery tramite provider o flussi compatibili con le piattaforme.
- Playwright worker server-side come secondo BrowserWorkerProvider.
- A/B testing automatico di subject, copy e template.
- Lead prioritization predittiva basata su risultati storici.
- Multi-workspace SaaS completo con billing.
- CRM sales pipeline più avanzato e booking call.
- Integrazione calendario e assegnazione commerciale.
- Provider email multipli per resilienza.

# 26. Handoff operativo a Kimi Swarm

Prima di scrivere codice, restituisci:

1. `CURRENT_STATE_AUDIT.md`
2. `IMPLEMENTATION_MAP.md`
3. `DATABASE_MIGRATION_PLAN.md`
4. `ARCHITECTURE.md` aggiornato
5. Piano di implementazione per fasi
6. `TEST_REPORT.md`
7. `OPERATIONS_RUNBOOK.md`
8. `RISK_REGISTER.md`

**Prima regola:** non creare duplicati di funzioni, tabelle o componenti già presenti. Adatta questa specifica allo stato reale del repository mantenendo invarianti i principi architetturali.

Al termine non limitarti a dichiarare “fatto”. Riporta:

- route implementate;
- tabelle e migrazioni;
- test eseguiti;
- feature complete/parziali/bloccate;
- configurazioni esterne mancanti;
- rischi residui;
- checklist di avvio produzione.
