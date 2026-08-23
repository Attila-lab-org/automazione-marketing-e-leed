/**
 * Template variables + messaging drafts — MASTER_SPEC §11, §11.1.
 *
 * Regole:
 * - Master template: versionato e MAI alterato dalla personalizzazione (§11).
 * - Personalized draft: snapshot generato per lead con variabili risolte.
 * - Manual override: modifica locale che non aggiorna il master (§11).
 * - Tutte le funzioni sono pure: nessuna mutazione degli input.
 */

import type { MessageDraft, MessageTemplateVersion } from '../types/domain';

/** Token nel formato {{variable_name}} (token/variable picker §11.1). */
const TOKEN_REGEX = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Variabili standard risolvibili dai dati lead (§9.1/§11.1). */
export const STANDARD_VARIABLES = [
  'business_name',
  'category',
  'city',
  'region',
  'phone',
  'email',
  'address',
  'demo_url',
  'screenshot_url',
  'sender_name',
] as const;
export type StandardVariable = (typeof STANDARD_VARIABLES)[number];

/** Estrae i nomi delle variabili presenti in un template (subject o body). */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(TOKEN_REGEX)) {
    found.add(match[1]);
  }
  return [...found];
}

export interface ResolveResult {
  resolved: string;
  usedVariables: string[];
  /** Variabili presenti nel template ma senza valore fornito (token lasciato intatto). */
  missingVariables: string[];
}

/**
 * Risolve i token {{var}} con i valori forniti. I token senza valore restano
 * intatti e vengono segnalati in missingVariables (mai risoluzione silenziosa).
 */
export function resolveVariables(template: string, variables: Record<string, string>): ResolveResult {
  const used = new Set<string>();
  const missing = new Set<string>();

  const resolved = template.replace(TOKEN_REGEX, (original, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null || value === '') {
      missing.add(name);
      return original;
    }
    used.add(name);
    return value;
  });

  return { resolved, usedVariables: [...used], missingVariables: [...missing] };
}

export interface BuildDraftOptions {
  sequenceStep?: number;
}

/**
 * Genera il personalized draft (snapshot per lead, §11) da una versione master.
 * Il master non viene toccato: il draft è una struttura nuova.
 */
export function buildDraftFromTemplate(
  master: MessageTemplateVersion,
  variables: Record<string, string>,
  options: BuildDraftOptions = {},
): MessageDraft {
  const subject = resolveVariables(master.subject, variables);
  const body = resolveVariables(master.body, variables);

  return {
    templateVersionId: master.id,
    sequenceStep: options.sequenceStep ?? 0,
    subject: subject.resolved,
    body: body.resolved,
    resolvedVariables: { ...variables },
    missingVariables: [...new Set([...subject.missingVariables, ...body.missingVariables])],
    status: 'DRAFT',
    isOverride: false,
  };
}

export interface DraftOverride {
  subject?: string;
  body?: string;
}

/**
 * Applica un manual override (§11): ritorna una NUOVA draft con isOverride=true.
 * Il master template e la draft originale restano invariati; le variabili già
 * risolte vengono preservate.
 */
export function applyDraftOverride(draft: MessageDraft, override: DraftOverride): MessageDraft {
  if (override.subject === undefined && override.body === undefined) {
    throw new Error('applyDraftOverride: almeno uno tra subject e body deve essere fornito');
  }
  return {
    ...draft,
    subject: override.subject ?? draft.subject,
    body: override.body ?? draft.body,
    resolvedVariables: { ...draft.resolvedVariables },
    missingVariables: [...draft.missingVariables],
    isOverride: true,
    // Un override manuale riporta la bozza in stato DRAFT: richiede nuova approvazione.
    status: 'DRAFT',
  };
}

/**
 * Snapshot immutabile del contenuto realmente inviato (§11 "Sent message").
 * Chiamato solo dopo che il Send Guard ha autorizzato l'invio.
 */
export function buildSentSnapshot(draft: MessageDraft): { subject: string; body: string } {
  if (draft.missingVariables.length > 0) {
    throw new Error(
      `buildSentSnapshot: variabili non risolte (${draft.missingVariables.join(', ')}): invio vietato`,
    );
  }
  return Object.freeze({ subject: draft.subject, body: draft.body });
}
