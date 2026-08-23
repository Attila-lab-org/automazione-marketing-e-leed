# CURRENT STATE AUDIT — Sales Automation OS

**Data audit:** fase 0 (pre-implementazione)
**Riferimento:** `docs/MASTER_SPEC.md` v1.0
**Scopo:** primo output obbligatorio dello Swarm prima di qualsiasi implementazione (§ Mandato a Kimi Swarm, §26).

---

## 1. Metodo di audit

Ispezione completa del repository Git (`main`), ricerca globale di codice sorgente, route, migrazioni, configurazioni e documentazione. Criterio: inventariare tutto ciò che esiste, identificare ciò che è riutilizzabile e congelare la baseline architetturale prima di scrivere codice.

---

## 2. Stato del repository

Il repository è **GREENFIELD (vuoto)**. L'inventario completo dei file non-Git è:

| Percorso | Contenuto | Stato |
|---|---|---|
| `docs/MASTER_SPEC.md` | Master Execution Specification v1.0 (26 sezioni, in italiano) | Presente, unica fonte di verità |

Non esistono altri file tracciati. Non esistono:

- `package.json`, `package-lock.json`/`pnpm-lock.yaml` (nessun progetto Node/Next.js inizializzato)
- directory `app/`, `pages/`, `src/`, `lib/`, `components/`, `tests/`
- directory `supabase/` né `supabase/migrations/` (nessuna migrazione applicabile)
- file di configurazione (`next.config.*`, `tsconfig.json`, `.env*`, `.eslintrc*`)
- CI/CD, Dockerfile, workflow
- README, ARCHITECTURE, DATABASE, OPERATIONS (richiesti dalla DoD §22.3, da creare)

## 3. Asset riutilizzabili

**Nessuno.** Conformemente alla prima regola di §26 ("non creare duplicati di funzioni, tabelle o componenti già presenti"), l'audit conferma che nel repository:

- **Funzioni/Domain Services**: 0 presenti — nulla da riutilizzare o rifattorizzare.
- **Tabelle/migrazioni DB**: 0 presenti — i nomi migrazione consigliati in §16.3 (0001–0010) possono essere adottati senza rinumerazione, poiché non esistono migrazioni preesistenti con cui collidere.
- **Route/API**: 0 presenti — tutti gli endpoint di §17 saranno implementati ex-novo.
- **Componenti UI**: 0 presenti — l'inventory §21 sarà costruito da zero.
- **Adapter provider**: 0 presenti — Google Places, Resend, BrowserWorkerProvider (Kimi/WebBridge), AI provider saranno implementati con mock/test mode obbligatorio (§22.3, §23.1).

**Conseguenza operativa:** ogni elemento verrà creato secondo spec; non è richiesta alcuna attività di deduplica o refactoring.

## 4. Baseline architetturale congelata (§24)

Le seguenti decisioni sono **congelate per V1** e costituiscono la baseline non modificabile senza motivazione tecnica documentata (§23.1):

| Decisione | Baseline |
|---|---|
| Discovery primaria | Google Places API (§13) |
| System of Record | Supabase (§15, §16) |
| Dashboard/Demo Runtime | Next.js su Vercel (§15, §10) |
| Browser automation iniziale | Kimi Work + WebBridge tramite adapter (§14) |
| Email provider iniziale | Resend (§11.2) |
| Lead workflow | prima discovery/qualifica, poi segmentazione, poi campagne (§3) |
| Segmentazione | categoria + score + confidence + area + filtri (§5.3) |
| Preview | sempre disponibile, anche in Full Auto (§7.3) |
| Message control | testo modificabile prima dell'invio nelle modalità con gate (§11) |
| Automation | Manual / Score-Based / Full Auto configurabile (§4) |
| Template model | master versionato + istanza configurativa (§9, §11) |
| Post-Swarm | refinement e modifiche chirurgiche in Cursor |

## 5. Invarianti non negoziabili (§1)

Queste invarianti vincolano ogni fase successiva e devono essere verificabili in ogni Definition of Done:

| Principio | Requisito | Verifica prevista |
|---|---|---|
| Lead-first | Nessun invio durante discovery/enrichment/analysis/scoring | Gate "Mai invio" sulle fasi §3; Send Guard come unico punto di emissione (§11.2) |
| Preview sempre disponibile | Demo e messaggio consultabili anche in Full Auto | Preview obbligatorie §7.3; test E2E §22.2 |
| Policy-driven | Manual/Score-Based/Full Auto = configurazione runtime, non rami di codice | Policy Engine unico (§4.1); test per le 3 modalità (§22.3) |
| Stateful & event-driven | Ogni fase salva stato e risultato; step falliti non corrompono la pipeline | Job persistenti/idempotenti/riprendibili (§15.1); stati separati (§3.1) |
| Provider abstraction | Google, Kimi/WebBridge, Resend, AI sostituibili via adapter | Interfacce adapter + mock mode (§14, §11.2) |
| Auditability | Ogni decisione automatica spiegabile e ricostruibile | Decision Trace §19.1 + activity_log append-only §16.4 |
| Safe-by-default | Nuove campagne partono Manual o Score-Based; Full Auto esplicito | Onboarding step 6 (§6.2): Full Auto mai pre-selezionato |
| Enterprise UX | Ridurre click, progressive disclosure, bulk actions, saved filters, onboarding guidato | UX rules §21.1 |

Invarianti operative aggiuntive (§23.1): migrazioni incrementali mai reset; niente auto-send senza Send Guard + suppression + kill switch; niente provider IDs/domini/soglie hardcoded; niente email reali in test/seed; ogni adapter esterno con mock/test mode; versioning preservato per template, demo, messaggi e policy.

## 6. Scope V1 vs out-of-scope

### 6.1 In scope V1 (§2.1)

1. Discovery lead locali con Google Places API (§13: query model, two-step discovery/enrichment, deduplica §13.2).
2. Normalizzazione, deduplica, categorizzazione e scoring deterministico + AI confidence (§5.1).
3. Analisi sito pubblico tramite Browser Worker con result contract §14.1.
4. Demo da template versionato con URL dinamico su Vercel (§9, §10).
5. Screenshot desktop/mobile visibili in dashboard (§10.1).
6. Messaggi da template, editabili quando la policy prevede revisione (§11).
7. Segmentazione per categoria, punteggio, confidence, territorio e filtri (§5.3).
8. Modalità Manual, Score-Based, Full Auto (§4).
9. Invio via Resend con Send Guard server-side, eventi, reply, suppression, follow-up (§11.2, §12).
10. Timeline e Decision Trace per ogni lead (§19.1).

### 6.2 Out-of-scope V1 (§2.2) — da NON implementare

- Page builder libero stile Webflow → V1 usa template strutturati e campi configurabili (§9.1).
- CRM completo (fatturazione/contratti/customer success).
- Machine learning proprietario → V1 = scoring deterministico + AI confidence.
- Automazioni invasive su social/direct non supportate ufficialmente.
- Multi-tenant SaaS commerciale completo → progettare workspace-ready, ma V1 può operare con un solo workspace owner.

Anche il backlog §25 (Playwright come secondo BrowserWorkerProvider, A/B testing, prioritizzazione predittiva, multi-workspace con billing, CRM avanzato, calendario, multi email provider) è **fuori V1** e non deve contaminare l'implementazione.

## 7. Gap da colmare — mappatura alle fasi §23

Poiché il repository è vuoto, **ogni capability della spec è un gap**. La mappatura seguente collega i gap alle fasi del piano §23:

| Fase §23 | Workstream | Gap da colmare (stato attuale: assente) |
|---|---|---|
| Phase 0 | Audit repo/current state | ✅ Coperto dal presente documento |
| Phase 1 | Foundation | Next.js shell, workspace/auth/RLS, migrazioni 0001–0010 (§16.3), types condivisi |
| Phase 2 | Lead domain | Google Places adapter (mock + live, two-step §13.1), tabella `leads` + `lead_contacts`/`lead_sources`, dedupe §13.2, segmenti §5.3 |
| Phase 3 | Scoring + policy | Score engine (5 dimensioni §5.1, breakdown versionato), Policy Engine (§4.1), policy snapshot su campaign_lead/job |
| Phase 4 | Template + demo | Template registry master+versioni (§9), demo_sites/demo_versions/demo_assets, route demo pubblica (§10), editor §9.2 |
| Phase 5 | Jobs + browser contract | Coda job §15.1 con lease atomici e idempotency_key, BrowserWorkerProvider interface + adapter Kimi/WebBridge (§14), result contract §14.1, screenshot pipeline §10.1 |
| Phase 6 | Messaging | Message templates/drafts/versioning (§11), Resend adapter server-side, Send Guard (§11.2), webhook eventi §17 |
| Phase 7 | Campaign + review | Campaign wizard §8.1, Review Queue §8.2, bulk controls con conferma esplicita |
| Phase 8 | Inbox + follow-up | Threads, inbound handling, cancellazione atomica follow-up su reply (§12.2), suppression |
| Phase 9 | Analytics + operations | KPI §20 con drill-down, health provider, audit, kill switch §19.2 |
| Phase 10 | QA + hardening | Test minimi §22.2, DoD §22.3, documentazione README/ARCHITECTURE/DATABASE/OPERATIONS |

## 8. Dipendenze esterne e prerequisiti di configurazione

Prima che le fasi dipendenti dai provider possano andare in live mode servono configurazioni esterne **non presenti** nel repository:

- **Google Places API key** (onboarding step 2, §6.2) → altrimenti mock mode obbligatorio (§22.3).
- **Resend API key + dominio mittente autenticato + webhook** (onboarding step 3; domain reputation §18) → altrimenti mock/test mode.
- **Kimi Work/WebBridge session** per Browser Worker (§14) → altrimenti BrowserWorkerProvider con mock.
- **Supabase project** (DB, Storage bucket per asset/screenshot §10, Auth) — onboarding step 4.
- **Dominio `demo.<dominio>`** per URL pattern §10.

Tutti i secret devono vivere solo server-side (§18 Secrets; §11.2: API key mai al client).

## 9. Rischi e vincoli ereditati dallo stato corrente

1. **Greenfield = massima libertà, massima responsabilità**: nessun vincolo legacy, ma ogni scelta deve essere tracciabile alla spec; vietato inventare flussi commerciali (§ Mandato).
2. **Nessuna migrazione preesistente**: i nomi §16.3 sono adottabili così come sono; la rinumerazione prevista da §16.3 non è necessaria.
3. **Documentazione DoD assente**: README, ARCHITECTURE, DATABASE, OPERATIONS vanno prodotti durante le fasi (§22.3).
4. **Nessun secret/credenziale**: lo sviluppo iniziale deve avvenire interamente in mock mode; i test E2E §22.2 (discovery fake, full-auto dry run) sono progettati per questo.
5. **Single workspace owner accettabile in V1** (§2.2), ma schema e RLS devono essere workspace-ready (§16.4).

## 10. Conclusione

Il repository contiene esclusivamente `docs/MASTER_SPEC.md`. Non esiste alcun asset da riutilizzare né alcun rischio di duplicazione. La baseline architetturale è quella congelata in §24, vincolata dalle invarianti §1 e dallo scope §2. L'implementazione può iniziare da Phase 1 secondo il piano §23, rispettando le regole operative §23.1. Il presente audit soddisfa il requisito di Phase 0 ("nessuna modifica distruttiva").
