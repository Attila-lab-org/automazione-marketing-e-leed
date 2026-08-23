# ADR 001 — Ruolo di Kimi

Data: 2026-08-24
Stato: accettata
Slice: Phase C

## Decisione

Kimi **non** viene utilizzato come Browser Website Analysis nella pipeline
Google Places → qualification → demo.

## Ruolo futuro

Kimi sarà un **Social Lead Scout / First Contact Agent**: identificare lead
ad alta intenzione sui canali social (principalmente Facebook) e, in seguito,
gestire un primo contatto social.

## Cosa questo slice non fa

- Nessun adapter Kimi
- Nessuna analisi sito via browser
- Nessuno scraping Facebook
- Nessun messaggio Facebook

La provenance dei lead resta estendibile tramite `lead_sources.source_type`
(valore riservato `FACEBOOK`, non implementato).
