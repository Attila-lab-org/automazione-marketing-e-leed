import { describe, expect, it } from 'vitest';

import {
  applyDraftOverride,
  buildDraftFromTemplate,
  buildSentSnapshot,
  extractVariables,
  resolveVariables,
} from '../../src/lib/domain/templates';
import type { MessageTemplateVersion } from '../../src/lib/types/domain';

function masterTemplate(overrides: Partial<MessageTemplateVersion> = {}): MessageTemplateVersion {
  return {
    id: 'mtv-1',
    templateId: 'mt-1',
    version: 3,
    subject: 'Una proposta per {{business_name}}',
    body: 'Gentile {{business_name}} di {{city}},\nla vostra demo: {{demo_url}}',
    variables: ['business_name', 'city', 'demo_url'],
    ...overrides,
  };
}

const VARIABLES = {
  business_name: 'Ristorante Rossi',
  city: 'Milano',
  demo_url: 'https://demo.example.com/d/ristorante-rossi-a1b2c3',
};

describe('extractVariables / resolveVariables (§11.1)', () => {
  it('estrae variabili uniche anche con spazi nel token', () => {
    expect(extractVariables('{{ business_name }} e {{city}} e {{business_name}}')).toEqual([
      'business_name',
      'city',
    ]);
  });

  it('risolve tutti i token con valori forniti', () => {
    const result = resolveVariables('Ciao {{business_name}}!', VARIABLES);
    expect(result.resolved).toBe('Ciao Ristorante Rossi!');
    expect(result.missingVariables).toEqual([]);
    expect(result.usedVariables).toEqual(['business_name']);
  });

  it('token senza valore resta intatto ed è segnalato come missing', () => {
    const result = resolveVariables('Ciao {{business_name}} da {{sender_name}}', VARIABLES);
    expect(result.resolved).toBe('Ciao Ristorante Rossi da {{sender_name}}');
    expect(result.missingVariables).toEqual(['sender_name']);
  });
});

describe('buildDraftFromTemplate (§11 personalized draft)', () => {
  it('genera snapshot con variabili risolte senza toccare il master', () => {
    const master = masterTemplate();
    const masterBefore = structuredClone(master);

    const draft = buildDraftFromTemplate(master, VARIABLES, { sequenceStep: 1 });
    expect(draft.subject).toBe('Una proposta per Ristorante Rossi');
    expect(draft.body).toContain('Milano');
    expect(draft.body).toContain(VARIABLES.demo_url);
    expect(draft.templateVersionId).toBe('mtv-1');
    expect(draft.sequenceStep).toBe(1);
    expect(draft.isOverride).toBe(false);
    expect(draft.missingVariables).toEqual([]);

    // master invariato
    expect(master).toEqual(masterBefore);
  });

  it('segnala variabili mancanti nel draft', () => {
    const draft = buildDraftFromTemplate(masterTemplate(), { business_name: 'Bar Roma' });
    expect(draft.missingVariables.sort()).toEqual(['city', 'demo_url']);
  });
});

describe('applyDraftOverride (§11 manual override)', () => {
  it("l'override produce una nuova draft e non modifica né master né draft originale", () => {
    const master = masterTemplate();
    const masterBefore = structuredClone(master);
    const draft = buildDraftFromTemplate(master, VARIABLES);
    const draftBefore = structuredClone(draft);

    const overridden = applyDraftOverride(draft, { body: 'Corpo personalizzato a mano.' });
    expect(overridden.isOverride).toBe(true);
    expect(overridden.body).toBe('Corpo personalizzato a mano.');
    expect(overridden.subject).toBe(draft.subject); // non toccato
    expect(overridden.status).toBe('DRAFT'); // richiede nuova approvazione

    // draft originale e master invariati
    expect(draft).toEqual(draftBefore);
    expect(master).toEqual(masterBefore);
  });

  it('rifiuta override vuoto', () => {
    const draft = buildDraftFromTemplate(masterTemplate(), VARIABLES);
    expect(() => applyDraftOverride(draft, {})).toThrow();
  });
});

describe('buildSentSnapshot (§11 sent message immutabile)', () => {
  it('produce snapshot frozen del contenuto inviato', () => {
    const draft = buildDraftFromTemplate(masterTemplate(), VARIABLES);
    const snapshot = buildSentSnapshot(draft);
    expect(snapshot.subject).toBe('Una proposta per Ristorante Rossi');
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('rifiuta lo snapshot se ci sono variabili non risolte', () => {
    const draft = buildDraftFromTemplate(masterTemplate(), { business_name: 'X' });
    expect(() => buildSentSnapshot(draft)).toThrow(/variabili non risolte/);
  });
});
