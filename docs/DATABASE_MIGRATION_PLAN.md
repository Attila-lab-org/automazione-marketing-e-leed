# DATABASE MIGRATION PLAN — Sales Automation OS

**Riferimento:** `MASTER_SPEC.md` (§3.1, §4, §4.1, §13.2, §15.1, §16, §18, §19.2, §22)
**Stato repository:** GREENFIELD — nessuna migrazione preesistente in `supabase/migrations/` (verificato). La numerazione 0001–0010 di §16.3 è quindi applicabile senza rinumerazione.
**Target:** Supabase (PostgreSQL 15+), schema `public`, migrazioni SQL versionate nel repository.

---

## 1. Convenzioni generali

| Convenzione | Regola |
|---|---|
| Naming file | `supabase/migrations/0001_<nome_snake>.sql` … `0010_<nome_snake>.sql` |
| PK | `id uuid primary key default gen_random_uuid()` |
| Timestamp | `timestamptz not null default now()` (`created_at`, `updated_at`) |
| Multi-tenant | ogni tabella tenant-owned ha `workspace_id uuid not null references workspaces(id) on delete cascade` |
| Dati flessibili | `jsonb not null default '{}'` / `'[]'` per snapshot, breakdown, filtri, payload |
| Immutabilità | snapshot (policy, messaggi inviati, versioni) protetti da trigger `FORBID UPDATE/DELETE` |
| Estensioni | `pgcrypto` (default Supabase), `pg_trgm` per fuzzy name matching (solo segnale, §13.2 punto 5) |
| Segreti | MAI in tabelle. `provider_connections` contiene solo metadata non sensibili; i secret vivono in env/secret store server-side (§18) |

Tutte le tabelle hanno **RLS abilitata** (`enable row level security` + `force row level security`). La regola dettagliata è in §8 di questo documento.

---

## 2. Strategia di applicazione ripetibile e rinumerazione anti-collisione (§16.3, §23.1)

1. Le migrazioni sono **incrementali, versionate in git, applicate una sola volta** e tracciate da Supabase in `supabase_migrations.schema_migrations`. L'applicazione è quindi ripetibile in sicurezza: rieseguire il comando non ri-applica ciò che è già registrato.
2. Comando canonico: **`supabase migration up`** (locale e linked project). In CI/CD: `supabase db push --linked` dopo review. Mai modifiche manuali non tracciate allo schema production (§16).
3. **MAI `supabase db reset`** su ambienti condivisi, staging o production: il reset è ammesso solo su database locale usa-e-getta (§23.1: "mai reset DB come scorciatoia").
4. **Mai modificare una migration già applicata**: qualsiasi correzione avviene tramite una nuova migration incrementale.
5. **Convenzione di rinumerazione anti-collisione (§16.3):**
   - Prima di creare nuove migration: `ls supabase/migrations/` e `supabase migration list`.
   - Se i prefissi 0001–0010 risultano occupati, l'intero blocco viene traslato al primo blocco libero di 10 (es. `0011`–`0020`), **preservando l'ordine interno** (le FK dipendono dall'ordine).
   - Il mapping adottato va annotato in testata a questo documento e nel commit message.
   - Dopo l'applicazione, verifica con `supabase migration list` che non esistano migration "applied remote but not local" o viceversa.
6. Ordine di dipendenza: ogni migration assume che le precedenti siano applicate (es. `leads` richiede `workspaces` ed enum da 0001).

---

## 3. Enum globali (creati in 0001, salvo diversa indicazione)

### 3.1 `workspace_role` (§16.4)
```sql
create type workspace_role as enum ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
```

### 3.2 `policy_mode` (§4)
```sql
create type policy_mode as enum ('MANUAL', 'SCORE_BASED', 'FULL_AUTO');
```
Default sicuro ovunque: `'MANUAL'` (Safe-by-default, §1). Full Auto non è mai pre-selezionato (§6.2 step 6).

### 3.3 `policy_gate_mode` — gate granulare per singola azione (§4.1)
```sql
create type policy_gate_mode as enum ('AUTO', 'SCORE_THRESHOLD', 'MANUAL', 'OFF');
```
Mappatura: discovery/enrichment/analysis/screenshot/message → `AUTO|MANUAL`; demo → `AUTO|SCORE_THRESHOLD|MANUAL`; send → `MANUAL|SCORE_THRESHOLD|AUTO`; follow-up → `OFF|MANUAL|AUTO`.

### 3.4 `business_status` (§3.1)
```sql
create type business_status as enum (
  'NEW', 'QUALIFIED', 'CAMPAIGN_READY', 'CONTACTED', 'REPLIED',
  'INTERESTED', 'WON', 'LOST', 'NOT_INTERESTED', 'SUPPRESSED'
);
```

### 3.5 `processing_status` (§3.1)
```sql
create type processing_status as enum (
  'IDLE', 'ENRICHING', 'ANALYZING', 'SCORING', 'DEMO_GENERATING',
  'SCREENSHOT_GENERATING', 'MESSAGE_GENERATING', 'SENDING', 'FAILED'
);
```
I due stati restano **separati** su colonne distinte (§3.1: mai un singolo status).

### 3.6 Enum creati nelle migration successive
| Enum | Migration | Valori |
|---|---|---|
| `demo_status` | 0004 | `DRAFT, PUBLISHED, DISABLED, EXPIRED` |
| `asset_kind` | 0004 | `LOGO, HERO, GALLERY, SCREENSHOT_DESKTOP, SCREENSHOT_MOBILE, OTHER` |
| `campaign_status` | 0005 | `DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED` |
| `campaign_lead_status` | 0005 | `PENDING, GENERATING, READY, REVIEW, APPROVED, SENDING, SENT, REPLIED, STOPPED, FAILED, SKIPPED` |
| `draft_status` | 0006 | `DRAFT, READY, APPROVED, SENT, CANCELLED` |
| `message_direction` | 0006 | `OUTBOUND, INBOUND` |
| `message_event_type` | 0006 | `SENT, DELIVERED, OPENED, CLICKED, BOUNCED, COMPLAINED, UNSUBSCRIBED, REPLIED` |
| `suppression_reason` | 0006 | `HARD_BOUNCE, UNSUBSCRIBE, STOP_REQUEST, MANUAL` |
| `thread_status` | 0006 | `OPEN, NEEDS_REPLY, ARCHIVED` |
| `job_status` | 0007 | `QUEUED, RUNNING, RETRYING, SUCCEEDED, FAILED, CANCELLED` |
| `job_type` | 0007 | `DISCOVERY_RUN, LEAD_ENRICHMENT, WEBSITE_ANALYSIS, LEAD_SCORING, DEMO_GENERATION, SCREENSHOT_DESKTOP, SCREENSHOT_MOBILE, MESSAGE_GENERATION, SEND_MESSAGE, FOLLOWUP_STEP, WEBHOOK_PROCESSING` |
| `actor_type` | 0008 | `USER, SYSTEM, WORKER` |
| `activity_category` | 0008 | `BUSINESS, TECHNICAL, DECISION` |
| `provider_type` | 0009 | `GOOGLE_PLACES, RESEND, BROWSER_WORKER, AI` |
| `provider_mode` | 0009 | `MOCK, LIVE` |
| `connection_status` | 0009 | `NOT_CONFIGURED, CONNECTED, DEGRADED, DISABLED` |

---

## 4. Migration `0001_core_workspace_auth`

**Contenuto (§16.3):** workspaces, members, enums, RLS base.

### 4.1 Estensioni ed enum
```sql
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
-- + tutti gli enum di §3.1–3.5 sopra
```

### 4.2 Tabella `workspaces`
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `name` | text not null | |
| `slug` | text not null unique | |
| `default_policy_mode` | policy_mode not null default `'MANUAL'` | safe-by-default |
| `default_policy` | jsonb not null default `'{}'` | policy workspace-level (§4.1), sovrascrivibile a livello campaign/category |
| `settings` | jsonb not null default `'{}'` | retention, rate limit default, flag operativi non-segreti (§18: tutto configurabile, niente hardcode) |
| `created_by` | uuid references `auth.users(id)` | |
| `created_at` / `updated_at` | timestamptz not null default now() | |

### 4.3 Tabella `workspace_members`
| Colonna | Tipo | Note |
|---|---|---|
| `workspace_id` | uuid not null FK → workspaces | `on delete cascade` |
| `user_id` | uuid not null FK → `auth.users(id)` | |
| `role` | workspace_role not null default `'VIEWER'` | |
| `invited_by` | uuid references `auth.users(id)` | |
| `created_at` | timestamptz | |
| PK | `(workspace_id, user_id)` | |

### 4.4 Funzioni helper RLS (SECURITY DEFINER per evitare ricorsione su `workspace_members`)
```sql
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid, p_roles workspace_role[]
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = any(p_roles)
  );
$$;

-- costanti riusabili nelle policy
-- p_roles = array['OWNER','ADMIN']::workspace_role[]            -> write amministrativa
-- p_roles = array['OWNER','ADMIN','OPERATOR']::workspace_role[] -> write operativa
```

### 4.5 RLS 0001
```sql
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_insert on public.workspaces
  for insert to authenticated with check (created_by = auth.uid());
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['OWNER','ADMIN']::workspace_role[]));

create policy members_select on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::workspace_role[]));
create policy members_update on public.workspace_members
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::workspace_role[]));
create policy members_delete on public.workspace_members
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER']::workspace_role[]));
```
Il ruolo `service_role` **bypassa RLS** per costruzione Supabase: la service key resta solo server-side (§11.2, §18) e non viene mai esposta al client.

---

## 5. Migration `0002_leads_sources_contacts`

**Contenuto (§16.3):** leads, contacts, sources, dedupe indexes.

### 5.1 Tabella `leads` (colonne core §16.2)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK → workspaces | |
| `google_place_id` | text nullable | identificatore forte (§13.1) |
| `name` | text not null | |
| `category` / `subcategory` | text | segmentazione §5.3 |
| `address` / `city` / `region` / `postal_code` / `country` | text | |
| `lat` / `lng` | numeric(9,6) | |
| `website_url` | text | |
| `normalized_domain` | text | derivato da website_url, lowercase, no `www.` |
| `phone` / `email` | text | convenience fields (copia del contatto primario in `lead_contacts`, §16.2) |
| `normalized_phone` | text | solo cifre, formato E.164 senza `+` |
| `normalized_email` | text | lowercase trim |
| `business_status` | business_status not null default `'NEW'` | §3.1 |
| `processing_status` | processing_status not null default `'IDLE'` | §3.1 |
| `current_score` | int check (`between 0 and 100`) | denormalizzato dall'ultimo `lead_scores` corrente |
| `current_confidence` | int check (`between 0 and 100`) | |
| `rating` | numeric(2,1) | segnale business potential §5.1 |
| `review_count` | int | |
| `google_last_enriched_at` | timestamptz | §13.1 |
| `created_at` / `updated_at` | timestamptz | |

**Vincolo dedupe primario (§16.2):**
```sql
create unique index leads_workspace_place_key
  on public.leads (workspace_id, google_place_id)
  where google_place_id is not null;
```
Unique parziale: ammette più lead con `google_place_id` NULL (inserimenti manuali), ma un solo lead per Place ID dentro il workspace (§13.2 segnale n.1).

**Indici dedupe §13.2 (segnali 2–4):**
```sql
create index leads_dedupe_domain_idx on public.leads (workspace_id, normalized_domain)
  where normalized_domain is not null;
create index leads_dedupe_phone_idx  on public.leads (workspace_id, normalized_phone)
  where normalized_phone is not null;
create index leads_dedupe_email_idx  on public.leads (workspace_id, normalized_email)
  where normalized_email is not null;
```
Il match fuzzy su nome + distanza geografica (§13.2 segnale 5) è solo informativo: nessun merge automatico basato sul solo fuzzy match.
```sql
create index leads_name_trgm_idx on public.leads using gin (lower(name) gin_trgm_ops);
```

**Indici operativi (segmentazione §5.3, lead list §7.1):**
```sql
create index leads_workspace_category_idx  on public.leads (workspace_id, category, subcategory);
create index leads_workspace_score_idx     on public.leads (workspace_id, current_score desc);
create index leads_workspace_bstatus_idx   on public.leads (workspace_id, business_status);
create index leads_workspace_pstatus_idx   on public.leads (workspace_id, processing_status);
create index leads_workspace_geo_idx       on public.leads (workspace_id, region, city);
```

### 5.2 Tabella `lead_contacts`
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `lead_id` | uuid not null FK → leads `on delete cascade` | |
| `type` | text not null check in `('EMAIL','PHONE','PERSON','OTHER')` | |
| `value` | text not null | valore originale |
| `normalized_value` | text | chiave di dedupe cross-contact |
| `label` | text | es. "info", "ufficio" |
| `is_primary` | boolean not null default false | alimenta i convenience fields di `leads` |
| `source` | text | es. `GOOGLE_PLACES`, `WEBSITE_ANALYSIS`, `MANUAL` |
| `created_at` | timestamptz | |

Indici: `(lead_id)`, `(workspace_id, normalized_value)`.

### 5.3 Tabella `lead_sources` (provenance §13, Decision Trace §19.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `lead_id` | uuid not null FK → leads | |
| `source_type` | text not null check in `('GOOGLE_PLACES_DISCOVERY','GOOGLE_PLACES_ENRICHMENT','WEBSITE_ANALYSIS','MANUAL','IMPORT')` | |
| `external_id` | text | es. google_place_id alla scoperta |
| `query_snapshot` | jsonb not null default `'{}'` | categoria/area/raggio/filtri della query di discovery (§13.1) |
| `created_at` | timestamptz | |

Indici: `(lead_id)`, `(workspace_id, source_type)`.

### 5.4 RLS 0002 (pattern standard, ripetuto per tutte le tabelle tenant-owned)
```sql
-- per ciascuna delle tre tabelle:
create policy <t>_select on public.<t> for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy <t>_insert on public.<t> for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::workspace_role[]));
create policy <t>_update on public.<t> for update to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN','OPERATOR']::workspace_role[]));
create policy <t>_delete on public.<t> for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['OWNER','ADMIN']::workspace_role[]));
```
Viewer = solo SELECT. Operator = write operativa su lead/contatti. Delete riservata a Owner/Admin.

---

## 6. Migration `0003_audits_scores_segments`

**Contenuto (§16.3):** website_audits, lead_scores, tags, segments.

### 6.1 Tabella `website_audits` (result contract §14.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `lead_id` | uuid not null FK → leads | |
| `audit_version` | int not null | audit versionato |
| `final_url` | text | URL finale |
| `redirect_chain` | jsonb not null default `'[]'` | |
| `emails_found` / `phones_found` | jsonb default `'[]'` | contatti pubblici trovati |
| `social_links` | jsonb default `'[]'` | |
| `ctas` | jsonb default `'[]'` | CTA principali |
| `key_pages` | jsonb default `'[]'` | pagine chiave |
| `mobile_signals` | jsonb default `'{}'` | segnali responsive/mobile |
| `issues` | jsonb not null default `'[]'` | elementi `{type, severity, evidence, confidence}` (§14.1) |
| `opportunities` | jsonb not null default `'[]'` | |
| `evidence_assets` | jsonb default `'[]'` | riferimenti a screenshot/evidenze |
| `raw_result` | jsonb | output normalizzato completo del Browser Worker |
| `analyzed_by` | text | provider adapter usato (mai hardcoded, §1 provider abstraction) |
| `created_at` | timestamptz | |

Vincolo: `unique (lead_id, audit_version)`. Indici: `(lead_id, audit_version desc)`, `(workspace_id, created_at desc)`.

### 6.2 Tabella `lead_scores` (§5.1: score spiegabile e versionato)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `lead_id` | uuid not null FK → leads | |
| `algorithm_version` | text not null | obbligatorio §5.1 |
| `opportunity_score` | int check 0–100 | |
| `contactability_score` | int check 0–100 | |
| `data_confidence_score` | int check 0–100 | |
| `template_match_score` | int check 0–100 | |
| `business_potential_score` | int check 0–100 | |
| `total_score` | int check 0–100 | |
| `confidence` | int check 0–100 | |
| `breakdown` | jsonb not null default `'{}'` | dettaglio per dimensione con evidenze |
| `reasons` | jsonb not null default `'[]'` | motivazioni sintetiche §5.1 |
| `is_current` | boolean not null default true | un solo score corrente per lead |
| `created_at` | timestamptz | |

```sql
create unique index lead_scores_current_key on public.lead_scores (lead_id) where is_current;
```
Trigger `BEFORE INSERT`: se il nuovo record ha `is_current = true`, pone `is_current = false` sugli altri record del lead e aggiorna `leads.current_score/current_confidence`. **Mai accettare un numero unico senza evidenze** (§5.1): `breakdown` e `reasons` sono `not null`.

### 6.3 Tabelle `tags` e `lead_tags` (§5.3 tag custom)
```sql
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create unique index tags_workspace_name_key on public.tags (workspace_id, lower(name));

create table public.lead_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);
create index lead_tags_workspace_idx on public.lead_tags (workspace_id, tag_id);
```

### 6.4 Tabella `segments` (saved filter definitions §5.3)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `name` | text not null | |
| `description` | text | |
| `filters` | jsonb not null | definizione filtri: categoria, regione/provincia/città/raggio, score range, confidence min, sito sì/no, audit sì/no, email sì/no, template match min, rating/review, business/processing status, campagna assegnata sì/no, tag |
| `is_archived` | boolean not null default false | |
| `created_by` | uuid references auth.users | |
| `created_at` / `updated_at` | timestamptz | |

`unique (workspace_id, lower(name))`.

### 6.5 RLS 0003
Pattern standard §5.4. `website_audits`/`lead_scores`: insert/update anche per OPERATOR (produce output pipeline); delete solo Owner/Admin. La scrittura da worker avviene via service_role server-side (i worker non hanno JWT utente).

---

## 7. Migration `0004_templates_demos`

**Contenuto (§16.3):** template/version, demo/version/assets. Modello §9: master versionato + istanza configurativa.

### 7.1 Enum
```sql
create type demo_status as enum ('DRAFT', 'PUBLISHED', 'DISABLED', 'EXPIRED');
create type asset_kind as enum ('LOGO','HERO','GALLERY','SCREENSHOT_DESKTOP','SCREENSHOT_MOBILE','OTHER');
```

### 7.2 Tabella `website_templates` (identità logica §9)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | i template seed vengono materializzati per workspace (0010) → RLS uniforme |
| `key` | text not null | identità logica stabile |
| `name` / `description` | text | |
| `category` | text | categoria target per template match §5.1 |
| `status` | text not null default `'ACTIVE'` check in `('ACTIVE','ARCHIVED')` | |
| `created_at` / `updated_at` | timestamptz | |

`unique (workspace_id, key)`.

### 7.3 Tabella `website_template_versions` (snapshot §9)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `template_id` | uuid not null FK → website_templates | |
| `version` | int not null | `unique (template_id, version)` |
| `layout_key` | text not null | |
| `component_version` | text not null | |
| `schema` | jsonb not null | campi configurabili §9.1 (business_name, logo, palette, hero, about, services, highlights, gallery, contatti, social, CTA, visibility toggle) |
| `default_content` | jsonb not null default `'{}'` | |
| `is_published` | boolean not null default false | |
| `created_at` | timestamptz | |

Versioni **immutabili** dopo publish: trigger `FORBID UPDATE/DELETE` quando `is_published = true`.

### 7.4 Tabella `demo_sites` (istanza collegata al lead §9, §10)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | ID interno separato dallo slug (§10) |
| `workspace_id` | uuid not null FK | |
| `lead_id` | uuid not null FK → leads | |
| `template_id` / `template_version_id` | uuid not null FK | template e versione congelati all'istanza |
| `slug` | text not null | leggibile, `unique (workspace_id, slug)` |
| `short_id` | text not null unique | non sequenziale (anti-enumerazione §10, §18 demo privacy) |
| `public_url` | text | pattern `https://demo.<dominio>/d/<slug>-<short-id>` |
| `status` | demo_status not null default `'DRAFT'` | disattivabile/scadibile §10 |
| `current_version_id` | uuid FK → demo_versions nullable | |
| `noindex` | boolean not null default true | `noindex,nofollow` per demo prospect §10 |
| `published_at` / `disabled_at` / `expires_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

Indici: `(lead_id)`, `(workspace_id, status)`.

### 7.5 Tabella `demo_versions` (snapshot dati per revisione/pubblicazione §9)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `demo_site_id` | uuid not null FK → demo_sites | |
| `version` | int not null | `unique (demo_site_id, version)` |
| `data` | jsonb not null | snapshot completo dei campi §9.1 |
| `is_published` | boolean not null default false | |
| `created_by` | uuid references auth.users | |
| `created_at` | timestamptz | |

Versioni pubblicate immutabili (trigger). "Restore Previous Version" crea una **nuova** versione copiando i dati (mai update distruttivo, §9.2).

### 7.6 Tabella `demo_assets` (§9, §10: asset e screenshot in Supabase Storage)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `demo_site_id` | uuid not null FK → demo_sites | |
| `lead_id` | uuid FK → leads nullable | |
| `kind` | asset_kind not null | |
| `storage_bucket` / `storage_path` | text not null | puntatore a Supabase Storage |
| `public_url` | text | |
| `provenance` | jsonb not null default `'{}'` | origine asset registrata (§9.2): provider, sorgente, job_id |
| `created_at` | timestamptz | |

Indici: `(demo_site_id, kind)`, `(workspace_id, kind)`.

### 7.7 RLS 0004
Pattern standard §5.4 su tutte le tabelle. Nota: le demo pubbliche sono servite dalle route Next.js con **service role server-side** (nessuna policy anon sulle tabelle); l'anti-enumerazione è garantita da `short_id` non sequenziale + `noindex`.

---

## 8. Migration `0005_campaigns_policies`

**Contenuto (§16.3):** campaigns, campaign_leads, policy versions. Include `followup_sequences` + `followup_sequence_versions` perché `campaigns` vi fa riferimento (creazione campagna step 5, §8.1).

### 8.1 Enum
```sql
create type campaign_status as enum ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED');
create type campaign_lead_status as enum (
  'PENDING','GENERATING','READY','REVIEW','APPROVED','SENDING','SENT','REPLIED','STOPPED','FAILED','SKIPPED'
);
```

### 8.2 Tabella `followup_sequences` / `followup_sequence_versions` (§12.2)
```sql
create table public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.followup_sequence_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  version int not null,
  steps jsonb not null default '[]',  -- [{step, delay_days, message_template_version_id, conditions}]
  created_at timestamptz not null default now(),
  unique (sequence_id, version)
);
```
Versioni immutabili (trigger `FORBID UPDATE/DELETE`).

### 8.3 Tabella `campaign_policy_versions` — **policy immutabili/versionate (§4.1)**
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `campaign_id` | uuid not null FK → campaigns | |
| `version` | int not null | `unique (campaign_id, version)` |
| `mode` | policy_mode not null | MANUAL / SCORE_BASED / FULL_AUTO (§4) |
| `actions` | jsonb not null | gate granulari §4.1: `{discovery, enrichment, website_analysis, demo_generation, screenshot, message_generation, send, followup}` ciascuno con `policy_gate_mode` coerente |
| `thresholds` | jsonb not null default `'{}'` | soglie score/confidence per SCORE_BASED (es. §5.2: opportunity ≥ 85, data_confidence ≥ 85, contactability ≥ 80, valid_email, business_status active) |
| `rate_limit` | jsonb not null default `'{}'` | per workspace/campaign/provider (§18) |
| `send_window` | jsonb not null default `'{}'` | finestra oraria (§8.1 step 7) |
| `daily_limit` | int | limite giornaliero (§8.1 step 7) |
| `is_active` | boolean not null default false | una sola versione attiva per campaign |
| `created_by` | uuid references auth.users | |
| `created_at` | timestamptz | |

**Immutabilità (§4.1 POLICY SNAPSHOT):** trigger `BEFORE UPDATE OR DELETE` che solleva eccezione su qualunque modifica: una nuova configurazione policy = una **nuova riga versione**. Una modifica futura non cambia retroattivamente i job già materializzati.

```sql
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Tabella append-only/versionata: UPDATE/DELETE vietati su %', tg_table_name;
end $$;

create trigger campaign_policy_versions_immutable
  before update or delete on public.campaign_policy_versions
  for each row execute function public.forbid_mutation();
```
(La stessa funzione è riusata per `followup_sequence_versions`, `website_template_versions` pubblicate, `demo_versions` pubblicate, `messages`, `activity_log`, `automation_job_events`.)

### 8.4 Tabella `campaigns` (§8.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `name` | text not null | |
| `description` | text | |
| `segment_id` | uuid FK → segments nullable | segmento sorgente §5.3 |
| `landing_template_id` / `landing_template_version_id` | uuid FK | template landing scelto (step 3) |
| `message_template_id` / `message_template_version_id` | uuid FK | template messaggio (step 4) |
| `followup_sequence_id` / `followup_sequence_version_id` | uuid FK nullable | sequenza follow-up (step 5) |
| `mode` | policy_mode not null default `'MANUAL'` | **Mai default FULL_AUTO** (§1 safe-by-default) |
| `active_policy_version_id` | uuid FK → campaign_policy_versions nullable | puntatore alla policy attiva |
| `status` | campaign_status not null default `'DRAFT'` | |
| `rate_limit_per_hour` | int | |
| `daily_send_limit` | int | |
| `send_window` | jsonb not null default `'{}'` | |
| `activated_at` / `paused_at` | timestamptz | Pause Campaign §19.2 |
| `created_by` | uuid references auth.users | |
| `created_at` / `updated_at` | timestamptz | |

Indici: `(workspace_id, status)`.

### 8.5 Tabella `campaign_leads` — membership, state, **policy snapshot (§4.1)**
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `campaign_id` | uuid not null FK → campaigns | |
| `lead_id` | uuid not null FK → leads | `unique (campaign_id, lead_id)` |
| `status` | campaign_lead_status not null default `'PENDING'` | |
| `policy_version_id` | uuid not null FK → campaign_policy_versions | riferimento alla versione applicata |
| `policy_snapshot` | jsonb not null | **copia completa e immutabile** della policy al momento della materializzazione: sopravvive a modifiche/disattivazioni della policy version |
| `sequence_step` | int not null default 0 | step follow-up corrente |
| `next_action_at` | timestamptz | schedulazione prossima azione |
| `demo_site_id` | uuid FK → demo_sites nullable | |
| `approved_by` / `approved_at` | uuid / timestamptz | gate umano (Review Queue §8.2) |
| `created_at` / `updated_at` | timestamptz | |

**Immutabilità snapshot:** trigger `BEFORE UPDATE` che vieta la modifica di `policy_snapshot` e `policy_version_id` dopo l'insert:
```sql
create or replace function public.campaign_leads_snapshot_guard() returns trigger
language plpgsql as $$
begin
  if new.policy_snapshot is distinct from old.policy_snapshot
     or new.policy_version_id is distinct from old.policy_version_id then
    raise exception 'policy snapshot immutabile su campaign_leads (§4.1)';
  end if;
  return new;
end $$;
```

Indici: `(campaign_id, status)`, `(lead_id)`, `(workspace_id, status, next_action_at)` (scheduling follow-up §12.2).

### 8.6 RLS 0005
Pattern standard §5.4 su tutte le tabelle. `campaigns` update (attivazione/pausa): Owner/Admin/Operator; attivazione **Full Auto** validata lato domain layer con conferma esplicita (§8.1 step 9) — la policy DB non distingue i mode, il gate applicativo è nel Campaign Service + `Danger Zone Modal` (§21).

---

## 9. Migration `0006_messaging`

**Contenuto (§16.3):** templates, drafts, threads, messages, events, suppression. Regole §11 (master versionato, draft personalizzato, override locale, sent snapshot immutabile) e §12 (inbox/follow-up).

### 9.1 Enum
```sql
create type draft_status as enum ('DRAFT','READY','APPROVED','SENT','CANCELLED');
create type message_direction as enum ('OUTBOUND','INBOUND');
create type message_event_type as enum
  ('SENT','DELIVERED','OPENED','CLICKED','BOUNCED','COMPLAINED','UNSUBSCRIBED','REPLIED');
create type suppression_reason as enum ('HARD_BOUNCE','UNSUBSCRIBE','STOP_REQUEST','MANUAL');
create type thread_status as enum ('OPEN','NEEDS_REPLY','ARCHIVED');
```

### 9.2 `message_templates` / `message_template_versions` (master §11)
```sql
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  category text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table public.message_template_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.message_templates(id) on delete cascade,
  version int not null,
  subject text not null,
  body text not null,
  variables jsonb not null default '[]',  -- token/variable picker §11.1
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
```
Master template **non alterato** dalla personalizzazione del singolo lead (§11); versioni immutabili (trigger).

### 9.3 Tabella `message_drafts` (bozze personalizzate §11)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `campaign_lead_id` | uuid not null FK → campaign_leads | |
| `lead_id` | uuid not null FK → leads | |
| `template_version_id` | uuid not null FK → message_template_versions | |
| `sequence_step` | int not null default 0 | |
| `subject` | text not null | |
| `body` | text not null | |
| `resolved_variables` | jsonb not null default `'{}'` | variabili già risolte (preview §7.3) |
| `status` | draft_status not null default `'DRAFT'` | |
| `is_override` | boolean not null default false | manual override: non aggiorna il master (§11) |
| `edited_by` | uuid references auth.users | |
| `approved_by` / `approved_at` | uuid / timestamptz | Approve & Send §11.1 |
| `created_at` / `updated_at` | timestamptz | |

**Idempotenza Send Guard (§11.2):**
```sql
create unique index message_drafts_step_key
  on public.message_drafts (campaign_lead_id, sequence_step);
```
→ nessun duplicato di draft per campaign_lead + sequence_step.

### 9.4 Tabella `message_threads` (§12.1)
```sql
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  subject text,
  status thread_status not null default 'OPEN',
  unread_count int not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index message_threads_lead_campaign_key
  on public.message_threads (lead_id, campaign_id) where campaign_id is not null;
```

### 9.5 Tabella `messages` — **sent/inbound snapshot immutabile (§11 "Sent message")**
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `thread_id` | uuid not null FK → message_threads | |
| `lead_id` | uuid not null FK → leads | |
| `campaign_lead_id` | uuid FK nullable | |
| `draft_id` | uuid FK → message_drafts nullable | traccia draft → send |
| `direction` | message_direction not null | |
| `provider` | text not null default `'resend'` | via adapter, non hardcoded altrove |
| `provider_message_id` | text | `unique where not null` → idempotenza |
| `from_address` / `to_address` | text not null | |
| `subject` | text | |
| `body_snapshot` | text not null | **snapshot immutabile del contenuto realmente inviato/ricevuto** |
| `sequence_step` | int not null default 0 | |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz | |

Immutabile: trigger `forbid_mutation` su UPDATE/DELETE. Unique parziale su `(provider, provider_message_id)`.

### 9.6 Tabella `message_events` (delivery/open/click/bounce §16.1, §18 webhook)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `message_id` | uuid not null FK → messages | |
| `event_type` | message_event_type not null | |
| `provider_event_id` | text | **`unique where not null` → idempotenza webhook §18** |
| `payload` | jsonb not null default `'{}'` | payload grezzo provider per audit |
| `occurred_at` | timestamptz not null | |
| `created_at` | timestamptz | |

Append-only (trigger `forbid_mutation`). Indici: `(message_id, occurred_at)`, `(workspace_id, event_type, occurred_at)`.

### 9.7 Tabella `suppression_list` (§12.2, §18)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `email` | text not null | valore originale |
| `normalized_email` | text not null | lowercase trim |
| `reason` | suppression_reason not null | |
| `source_message_id` | uuid FK → messages nullable | |
| `note` | text | |
| `created_at` | timestamptz | |

```sql
create unique index suppression_workspace_email_key
  on public.suppression_list (workspace_id, normalized_email);
```
Hard bounce / unsubscribe / stop request bloccano ogni invio successivo (Send Guard check "Recipient", §11.2). La verifica avviene server-side ad ogni send.

### 9.8 RLS 0006
Pattern standard §5.4. Eccezioni:
- `messages`, `message_events`: **nessuna policy UPDATE/DELETE** (append-only anche per Owner); scrittura via domain layer/service_role.
- `suppression_list`: insert/update Owner/Admin/Operator (serve per stop manuale), delete solo Owner.

---

## 10. Migration `0007_automation_jobs`

**Contenuto (§16.3):** jobs, job events, leases, idempotency. Requisiti §15 (job persistenti, idempotenti, riprendibili; lease atomici DB-level) e §15.1 (campi minimi).

### 10.1 Enum
```sql
create type job_status as enum ('QUEUED','RUNNING','RETRYING','SUCCEEDED','FAILED','CANCELLED');
create type job_type as enum (
  'DISCOVERY_RUN','LEAD_ENRICHMENT','WEBSITE_ANALYSIS','LEAD_SCORING',
  'DEMO_GENERATION','SCREENSHOT_DESKTOP','SCREENSHOT_MOBILE',
  'MESSAGE_GENERATION','SEND_MESSAGE','FOLLOWUP_STEP','WEBHOOK_PROCESSING'
);
```

### 10.2 Tabella `automation_jobs` — **tutti i campi obbligatori §15.1**
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | §15.1 |
| `workspace_id` | uuid not null FK | tenant scoping + rate limit per workspace §18 |
| `job_type` | job_type not null | §15.1 |
| `entity_type` | text not null | §15.1 (es. `lead`, `campaign_lead`, `demo_site`, `message`) |
| `entity_id` | uuid not null | §15.1 |
| `status` | job_status not null default `'QUEUED'` | §15.1 |
| `priority` | int not null default 100 | §15.1 — numero più basso = priorità più alta |
| `attempt_count` | int not null default 0 | §15.1 |
| `max_attempts` | int not null default 5 | §15.1 |
| `next_retry_at` | timestamptz | §15.1 — backoff esponenziale |
| `lease_owner` | text | §15.1 — worker id che detiene il lease |
| `lease_expires_at` | timestamptz | §15.1 — scadenza lease |
| `idempotency_key` | text not null **UNIQUE** | §15.1 — convenzione: `<job_type>:<entity_type>:<entity_id>:<scope>` (es. `SEND_MESSAGE:campaign_lead:<uuid>:step:1`) |
| `input_snapshot` | jsonb not null default `'{}'` | §15.1 — include policy snapshot quando rilevante |
| `result` | jsonb | §15.1 |
| `error_code` | text | §15.1 |
| `error_detail` | text | §15.1 |
| `depends_on_job_id` | uuid FK → automation_jobs nullable | dependency graph §15 (es. SCREENSHOT_MOBILE dopo SCREENSHOT_DESKTOP; SEND solo dopo screenshot READY §10.1) |
| `created_at` | timestamptz | §15.1 |
| `started_at` | timestamptz | §15.1 |
| `completed_at` | timestamptz | §15.1 |
| `cancelled_at` | timestamptz | cancellation §15 |

```sql
create unique index automation_jobs_idempotency_key_key on public.automation_jobs (idempotency_key);
create index automation_jobs_claim_idx on public.automation_jobs (status, next_retry_at, priority, created_at)
  where status in ('QUEUED','RETRYING');
create index automation_jobs_entity_idx on public.automation_jobs (entity_type, entity_id);
create index automation_jobs_workspace_status_idx on public.automation_jobs (workspace_id, status);
create index automation_jobs_lease_idx on public.automation_jobs (lease_expires_at)
  where status = 'RUNNING';
```

### 10.3 Lease atomico — funzione `claim_job` (FOR UPDATE SKIP LOCKED)
Claim atomico a livello database (§15.1): impedisce doppia elaborazione tra worker concorrenti.

```sql
create or replace function public.claim_job(
  p_worker_id      text,
  p_job_types      job_type[] default null,
  p_lease_seconds  integer    default 300,
  p_workspace_id   uuid       default null
) returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select j.id into v_job_id
  from public.automation_jobs j
  left join public.automation_jobs dep on dep.id = j.depends_on_job_id
  where j.status in ('QUEUED','RETRYING')
    and (j.next_retry_at is null or j.next_retry_at <= now())
    and (j.lease_expires_at is null or j.lease_expires_at <= now())
    and (p_job_types is null or j.job_type = any(p_job_types))
    and (p_workspace_id is null or j.workspace_id = p_workspace_id)
    and (j.depends_on_job_id is null or dep.status = 'SUCCEEDED')  -- dependency graph §15
  order by j.priority asc, j.created_at asc
  limit 1
  for update of j skip locked;   -- lease atomico: nessun doppio claim

  if v_job_id is null then
    return;
  end if;

  update public.automation_jobs
  set status           = 'RUNNING',
      lease_owner      = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      started_at       = coalesce(started_at, now()),
      attempt_count    = attempt_count + 1
  where id = v_job_id;

  insert into public.automation_job_events (workspace_id, job_id, event_type, actor, payload)
  select workspace_id, id, 'LEASED', p_worker_id,
         jsonb_build_object('lease_seconds', p_lease_seconds, 'attempt', attempt_count)
  from public.automation_jobs where id = v_job_id;

  return query select * from public.automation_jobs where id = v_job_id;
end $$;

revoke all on function public.claim_job(text, job_type[], integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_job(text, job_type[], integer, uuid) to service_role;
```
Solo `service_role` può eseguire il claim (worker server-side, §14 job ownership: Supabase conserva lo stato ufficiale).

### 10.4 Recovery job bloccati — `recover_stuck_jobs`
```sql
create or replace function public.recover_stuck_jobs(
  p_backoff_base_seconds integer default 60
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  update public.automation_jobs
  set status        = case when attempt_count >= max_attempts
                           then 'FAILED'::job_status else 'RETRYING'::job_status end,
      next_retry_at = case when attempt_count >= max_attempts
                           then null
                           else now() + make_interval(secs => p_backoff_base_seconds * power(2, attempt_count)) end,
      error_code    = coalesce(error_code, 'LEASE_EXPIRED'),
      error_detail  = coalesce(error_detail, 'Lease scaduto senza completamento: job recuperato dallo scheduler')
  where status = 'RUNNING'
    and lease_expires_at < now();

  get diagnostics v_count = row_count;

  insert into public.automation_job_events (workspace_id, job_id, event_type, actor, payload)
  select workspace_id, id,
         case when status = 'FAILED' then 'FAILED' else 'RETRY_SCHEDULED' end,
         'system:recover_stuck_jobs',
         jsonb_build_object('attempt_count', attempt_count, 'next_retry_at', next_retry_at)
  from public.automation_jobs
  where error_code = 'LEASE_EXPIRED' and completed_at is null and status in ('RETRYING','FAILED')
    and id in (select id from public.automation_jobs where status in ('RETRYING','FAILED') and lease_expires_at < now());

  return v_count;
end $$;

revoke all on function public.recover_stuck_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stuck_jobs(integer) to service_role;
```
Eseguita periodicamente (cron esterno / Supabase scheduled function / endpoint amministrativo). Dettagli operativi in `OPERATIONS_RUNBOOK.md` §7.

### 10.5 Tabella `automation_job_events` (audit tecnico job §16.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `job_id` | uuid not null FK → automation_jobs `on delete cascade` | |
| `event_type` | text not null check in `('ENQUEUED','LEASED','HEARTBEAT','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','RECOVERED')` | |
| `actor` | text | worker id / user id / `system:*` |
| `payload` | jsonb not null default `'{}'` | |
| `created_at` | timestamptz | |

Append-only (trigger `forbid_mutation`). Indici: `(job_id, created_at)`.

### 10.6 RLS 0007
- `automation_jobs`: SELECT per tutti i membri (voce "Automations → job status" §6.1); **nessuna policy INSERT/UPDATE/DELETE per `authenticated`** → enqueue/claim/complete/fail solo via service_role server-side.
- `automation_job_events`: SELECT per membri; insert solo service_role; append-only.

---

## 11. Migration `0008_activity_audit`

**Contenuto (§16.3):** activity log / decision trace.

### 11.1 Enum
```sql
create type actor_type as enum ('USER','SYSTEM','WORKER');
create type activity_category as enum ('BUSINESS','TECHNICAL','DECISION');
```

### 11.2 Tabella `activity_log` — timeline append-only e Decision Trace (§16.1, §19.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `actor_type` | actor_type not null | USER / SYSTEM / WORKER |
| `actor_user_id` | uuid references auth.users nullable | null = sistema |
| `entity_type` | text not null | es. `lead`, `campaign`, `message`, `demo_site`, `job` |
| `entity_id` | uuid not null | |
| `lead_id` | uuid FK → leads nullable | shortcut per Lead Timeline (§7.2 tab Timeline) |
| `category` | activity_category not null | BUSINESS / TECHNICAL / DECISION |
| `event_type` | text not null | es. `LEAD_CREATED`, `SCORE_COMPUTED`, `POLICY_DECISION`, `SEND_GUARD_RESULT`, `MESSAGE_SENT`, `KILL_SWITCH_ACTIVATED` |
| `message` | text | label leggibile (UX rule §21.1: niente gergo tecnico) |
| `data` | jsonb not null default `'{}'` | **Decision Trace §19.1**: lead source, dati usati, website audit version, score breakdown + algorithm_version, policy version + condizioni soddisfatte, demo/template/version, message template/draft/version, Send Guard result, provider message ID, riferimenti webhook events |
| `occurred_at` | timestamptz not null default now() | |

Indici:
```sql
create index activity_log_entity_idx on public.activity_log (workspace_id, entity_type, entity_id, occurred_at desc);
create index activity_log_lead_idx   on public.activity_log (lead_id, occurred_at desc);
create index activity_log_type_idx   on public.activity_log (workspace_id, category, event_type, occurred_at desc);
```

### 11.3 Append-only (§16.4: "niente update/delete ordinario")
1. **RLS**: solo policy `SELECT` (membri) e `INSERT` (membri autenticati + domain layer); nessuna policy UPDATE/DELETE → negate by default.
2. **Trigger di difesa in profondità**:
```sql
create trigger activity_log_append_only
  before update or delete on public.activity_log
  for each row execute function public.forbid_mutation();
```
Nota: il trigger blocca anche il service_role — la correzione di errori avviene con una nuova entry compensativa, mai con update.

---

## 12. Migration `0009_provider_settings`

**Contenuto (§16.3):** provider connection metadata, feature flags. Regole §18 (secrets solo server-side) e §19.2 (kill switch).

### 12.1 Enum
```sql
create type provider_type as enum ('GOOGLE_PLACES','RESEND','BROWSER_WORKER','AI');
create type provider_mode as enum ('MOCK','LIVE');
create type connection_status as enum ('NOT_CONFIGURED','CONNECTED','DEGRADED','DISABLED');
```

### 12.2 Tabella `provider_connections` (stato provider + metadata §16.1)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `provider` | provider_type not null | `unique (workspace_id, provider)` |
| `mode` | provider_mode not null default `'MOCK'` | **mock by default** — mai email reali senza configurazione esplicita (§23.1) |
| `status` | connection_status not null default `'NOT_CONFIGURED'` | `DISABLED` = kill switch "Disable Provider" §19.2 |
| `display_config` | jsonb not null default `'{}'` | **solo metadata non sensibili**: dominio mittente, from address, modello AI, endpoint webhook, capabilities. **Nessuna API key / secret** (§18: secrets solo in env/secret store server-side) |
| `last_verified_at` | timestamptz | verifica credenziali (onboarding §6.2 step 2–3) |
| `last_error` | text | health §21 Provider Status |
| `created_at` / `updated_at` | timestamptz | |

### 12.3 Tabella `workspace_feature_flags` (kill switch §19.2 + feature flags §16.3)
| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid not null FK | |
| `key` | text not null | `unique (workspace_id, key)` |
| `value` | jsonb not null | es. `{"enabled": true, "reason": "...", "set_by": "<user_id>"}` |
| `updated_by` | uuid references auth.users | |
| `updated_at` | timestamptz | |

**Chiavi kill switch riservate (§19.2):**

| Key | Kill switch | Effetto |
|---|---|---|
| `OUTREACH_PAUSED_ALL` | **PAUSE ALL OUTREACH** | blocca immediatamente nuovi send e follow-up (Send Guard e scheduler leggono questo flag per primi) |
| `DISCOVERY_PAUSED` | Pause Discovery | nessun nuovo job `DISCOVERY_RUN` / `LEAD_ENRICHMENT` verso Google |
| `BROWSER_WORKERS_PAUSED` | Pause Browser Workers | nessun nuovo job `WEBSITE_ANALYSIS` / `SCREENSHOT_*` |
| *(via `provider_connections.status = 'DISABLED'`)* | Disable Provider | nessuna nuova call al provider selezionato |
| *(via `campaigns.status = 'PAUSED'`)* | Pause Campaign | nessun nuovo send della campagna; job restano sospesi |

Ogni attivazione/disattivazione scrive una entry `KILL_SWITCH_ACTIVATED`/`KILL_SWITCH_RELEASED` in `activity_log` (auditability §1). Il check dei flag avviene **server-side** nel Policy Engine / Job Orchestrator prima di enqueue e nel Send Guard prima di ogni send.

### 12.4 RLS 0009
- `provider_connections`: SELECT per tutti i membri (serve al componente Provider Status §21); INSERT/UPDATE/DELETE solo Owner/Admin. Non contenendo secret, la lettura Operator/Viewer è sicura.
- `workspace_feature_flags`: SELECT per membri; INSERT/UPDATE solo Owner/Admin (i kill switch sono azioni privilegiate con `Danger Zone Modal` §21).

---

## 13. Migration `0010_seed_baseline`

**Contenuto (§16.3):** categorie/template/test data **non-production**. Requisiti seed §22.1.

### 13.1 Modalità di esecuzione
- Implementato come `supabase/seed.sql` (eseguito da `supabase db reset`/`supabase seed` in locale) **oppure** come migration `0010` con guardia esplicita:
```sql
do $$
begin
  if coalesce(current_setting('app.seed_mode', true), 'off') <> 'on' then
    raise notice 'seed_mode non attivo: seed saltato';
    return;
  end if;
  -- ... insert seed ...
end $$;
```
- **MAI eseguire in production.** In staging si esegue manualmente e consapevolmente. Nessun dato reale o secret nel repository (§22.1).

### 13.2 Contenuto seed (§22.1)
| Voce | Quantità | Note |
|---|---|---|
| Workspace demo | 1 | `Demo Workspace`, `default_policy_mode = 'MANUAL'` |
| Categorie demo | 5 | es. `ristoranti`, `parrucchieri`, `idraulici`, `dentisti`, `palestre` — realizzate come valori `category` dei lead + `tags` + `segments` di esempio (§16.1 non prevede tabella categorie: la categoria è attributo del lead) |
| Landing template | 2 (con `website_template_versions` pubblicate) | per almeno una categoria prioritaria |
| Message template | 2 (con versioni) + 1 follow-up sequence (con versione e 2 step) | |
| Lead fake realistici | 20 | stati/score vari: mix di `business_status` (NEW → SUPPRESSED), `processing_status`, score 0–100, con/senza sito, con/senza email, città diverse |
| Eventi email fake | ~30 | `messages` + `message_events` (DELIVERED/OPENED/CLICKED/BOUNCED/REPLIED) per popolare Inbox e Analytics |
| Provider connections | 4 righe | tutte `mode = 'MOCK'`, `status = 'NOT_CONFIGURED'` |
| Feature flags | kill switch tutti a `enabled: false` | |

Dati fake verificabili: dominio siti su `example.com`/`example.org`, email su dominio riservato `example.com` (RFC 2606) — **mai indirizzi reali** (§23.1).

---

## 14. Riepilogo copertura tabelle §16.1 → migration

| Tabella | Migration |
|---|---|
| workspaces, workspace_members | 0001 |
| leads, lead_contacts, lead_sources | 0002 |
| website_audits, lead_scores, tags, lead_tags, segments | 0003 |
| website_templates, website_template_versions, demo_sites, demo_versions, demo_assets | 0004 |
| campaigns, campaign_leads, campaign_policy_versions, followup_sequences, followup_sequence_versions | 0005 |
| message_templates, message_template_versions, message_drafts, message_threads, messages, message_events, suppression_list | 0006 |
| automation_jobs, automation_job_events | 0007 |
| activity_log | 0008 |
| provider_connections (+ workspace_feature_flags) | 0009 |
| seed dati demo | 0010 |

**31 tabelle §16.1 coperte + 1 tabella di supporto (`workspace_feature_flags`, prevista da §16.3 "feature flags" e necessaria ai kill switch §19.2). Nessuna tabella fuori scope V1 (§2.2): niente billing, niente CRM fatturazione, niente ML proprietario.**

---

## 15. Matrice RLS riepilogativa (§16.4)

| Tabella / gruppo | Viewer | Operator | Admin | Owner | service_role |
|---|---|---|---|---|---|
| workspaces | SELECT | SELECT | SELECT/UPDATE | ALL | ALL (bypass RLS) |
| workspace_members | SELECT | SELECT | SELECT/INSERT/UPDATE | ALL (anche DELETE) | ALL |
| leads, lead_contacts, lead_sources | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| website_audits, lead_scores, tags, lead_tags, segments | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| templates, demo_sites, demo_versions, demo_assets | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| campaigns, campaign_leads, followup_* | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| campaign_policy_versions | SELECT | SELECT/INSERT | SELECT/INSERT | SELECT/INSERT | SELECT/INSERT — UPDATE/DELETE vietati da trigger per TUTTI |
| message_templates, message_drafts, threads | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| messages, message_events | SELECT | SELECT | SELECT | SELECT | ALL (scrittura solo server-side) |
| suppression_list | SELECT | SELECT/INSERT/UPDATE | + DELETE | + DELETE | ALL |
| automation_jobs, automation_job_events | SELECT | SELECT | SELECT | SELECT | ALL (enqueue/claim solo service_role) |
| activity_log | SELECT | SELECT/INSERT | SELECT/INSERT | SELECT/INSERT | SELECT/INSERT — append-only per TUTTI |
| provider_connections | SELECT | SELECT | ALL | ALL | ALL |
| workspace_feature_flags | SELECT | SELECT | ALL | ALL | ALL |

Regole trasversali:
- **Tutte** le tabelle tenant-owned filtrano per `workspace_id` tramite `is_workspace_member` / `has_workspace_role` (§16.4).
- `service_role` solo server-side; la key non arriva mai al client (§11.2, §18). Le API key dei provider non arrivano mai al client né in DB in chiaro.
- `activity_log` append-only dal domain layer: niente update/delete ordinario (§16.4).
- Viewer read-only ovunque; Operator senza accesso a secrets (non ne esistono in DB) e senza write su provider/feature flags.

---

## 16. Verifica post-migrazione (checklist)

1. `supabase migration list` → tutte le migration applied, nessuna divergenza local/remote.
2. `\d+ leads` → unique parziale `(workspace_id, google_place_id) where google_place_id is not null` presente.
3. Test RLS (integration test §22.2 Security): utente di workspace B non legge lead di workspace A; Viewer non può INSERT; nessun utente autenticato può UPDATE/DELETE su `activity_log`.
4. Test idempotenza job: doppio enqueue con stessa `idempotency_key` → errore unique (gestito come no-op dal domain layer).
5. Test lease: 2 worker concorrenti chiamano `claim_job` → job diversi (`SKIP LOCKED`).
6. Test recovery: job `RUNNING` con lease scaduto → `recover_stuck_jobs()` lo porta a `RETRYING` (o `FAILED` a `max_attempts`).
7. Test policy snapshot: UPDATE di `policy_snapshot` su `campaign_leads` → eccezione; modifica policy campaign → nuova riga `campaign_policy_versions`, snapshot esistenti invariati.
8. Test immutabilità: UPDATE su `messages.body_snapshot` → eccezione.
9. Seed locale: `supabase db reset` (solo locale) esegue seed senza errori; dashboard mostra 20 lead fake.
