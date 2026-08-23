# TEST REPORT — Phase 1 Foundation

**Data:** 2026-08-23 · **Branch:** main · **Commit head:** fix typecheck + policy default

## Ambiente di verifica

Worktree pulito da `main`, `npm install` fresco. Supabase CLI/Docker/Postgres **non disponibili** nell'ambiente di esecuzione → validazione DB solo statica (parser PostgreSQL reale via pglast/libpg_query).

## Risultati

| Verifica | Comando | Esito |
|---|---|---|
| Unit test | `npx vitest run` | **74/74 verdi** (6 file: scoring 10, policy 22, send-guard 12, dedupe 12, templates 9, queue 9) |
| Typecheck | `npx tsc --noEmit` | **Pulito su fresh clone** (dopo fix LayoutProps → tipizzazione esplicita) |
| Build | `npm run build` | **Verde** — 13 route statiche (11 sezioni dashboard + redirect + not-found) |
| Lint | `npx eslint src` | **0 errori**, 10 warning non bloccanti (parametri `_` negli stub live adapter) |
| SQL statico | pglast (libpg_query) | 11 file SQL, ~450 statement parsati OK; corpi plpgsql validati |
| Review indipendente | subagent reviewer | **6/6 controlli PASS**, nessun problema bloccante |

## Copertura invarianti (reviewer)

- 31/31 tabelle §16.1 presenti (+ `workspace_feature_flags` autorizzata da §16.3) — **PASS**
- 17 enum SQL riconciliati 1:1 con tipi TS — **PASS**
- Nessun secret, seed solo domini RFC 2606, mock mode di default su 4/4 provider — **PASS**
- Policy snapshot immutabile (trigger SQL + deep-freeze TS), Send Guard unico gate (7 check §11.2), mai-invio-pre-qualifica, activity_log append-only — **PASS**
- RLS ENABLE+FORCE su 32/32 tabelle, job idempotency/retry con SKIP LOCKED — **PASS**

## Fix applicati in chiusura fase

1. `src/app/layout.tsx`: rimosso tipo globale `LayoutProps` (richiedeva typegen) → typecheck pulito su fresh clone.
2. `src/lib/domain/policy.ts`: `DEFAULT_WORKSPACE_POLICY` allineata a safe-by-default (§1, §6.2) e al seed — gate discovery/enrichment/analysis su MANUAL.

## Aperto per Phase 2 (non bloccante)

- **Test RLS/migrazioni su Postgres reale** (`supabase db reset` + integration test) — primo task di Phase 2; voce DoD §22.3 "RLS applicata e testata" coperta solo staticamente.
- Verificare su DB reale: `FOR UPDATE OF j SKIP LOCKED` con LEFT JOIN, ON CONFLICT con indice parziale nel seed.
- Bootstrap primo Owner via service_role (pattern documentato in OPERATIONS_RUNBOOK).
- 10 warning eslint su stub live adapter (spariranno con l'implementazione live).
