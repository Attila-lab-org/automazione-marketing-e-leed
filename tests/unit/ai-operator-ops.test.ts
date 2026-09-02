import { describe, expect, it } from 'vitest';
import { TOOL_CONTRACTS, contractsByTier, getToolContract, isConfirmTier } from '../../src/lib/ai/operator/tool-contracts';
import {
  applyPlaybookCommand,
  detectOperatorOpsAction,
  extractNamedLeadHint,
} from '../../src/lib/ai/operator/ops-writes';
import { closeOutSummary } from '../../src/lib/sales/close-out';
import { resolvePendingReuse } from '../../src/lib/ai/operator/pending';
import {
  ATTILA_UNAVAILABLE_REPLY,
  classifyOperatorIntent,
  isAttilaAvailabilityQuestion,
  isBulkCampaignWipe,
  isOpenedCampaignFollowup,
} from '../../src/lib/ai/operator/intent';
import { parseEuropeRomeDateTime, formatEuropeRome } from '../../src/lib/ai/operator/time';
import { planOperatorTurnMock } from '../../src/lib/ai/operator/semantic-plan';
import { envelopeFromPath } from '../../src/lib/ai/operator/envelope';
import { emptyEntityRefs, extractOperatorPreference } from '../../src/lib/ai/operator/context';
import { composeOperatorReply, navigationActionForQuestion } from '../../src/lib/ai/operator/compose';
import { createMemoryOperatorData } from '../../src/lib/ai/operator/data';
import { collectOperatorTurn } from '../../src/lib/ai/operator/turn';
import type { PersistAiRun } from '../../src/lib/ai/persist';
import type { AiRunPublic } from '../../src/lib/ai/types';
import { DEFAULT_PLAYBOOK } from '../../src/lib/sales/playbook';
import { buildDailyCommercialBriefing } from '../../src/lib/sales/daily-briefing';

describe('tool contracts', () => {
  it('marks external and irreversible ops as confirm tiers', () => {
    expect(getToolContract('reply_telegram')?.tier).toBe('INTERNAL');
    expect(getToolContract('cancel_appointment')?.tier).toBe('CONFIRM_IRREVERSIBLE');
    expect(getToolContract('pause_campaign')?.tier).toBe('CONFIRM_IRREVERSIBLE');
    expect(getToolContract('create_calendar_slot')?.tier).toBe('INTERNAL');
    expect(getToolContract('send_email')?.tier).toBe('DENIED');
    expect(isConfirmTier('CONFIRM_EXTERNAL')).toBe(true);
    expect(contractsByTier('READ').length).toBeGreaterThan(10);
    expect(Object.keys(TOOL_CONTRACTS).length).toBeGreaterThan(20);
  });
});

describe('pending action reuse', () => {
  it('riusa la conferma ancora aperta e resetta quella già eseguita', () => {
    expect(
      resolvePendingReuse({
        status: 'pending',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    ).toBe('reuse');
    expect(
      resolvePendingReuse({
        status: 'executed',
        expires_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('reset');
    expect(resolvePendingReuse(null)).toBe('insert');
  });
});

describe('bulk wipe safety', () => {
  it('riconosce la richiesta di cancellare tutte le campagne e le mail', () => {
    expect(isBulkCampaignWipe('voglio che cancelli tutte le campagne e le mail inviate')).toBe(true);
    expect(isOpenedCampaignFollowup('l ho aperta')).toBe(true);
    expect(isBulkCampaignWipe('ferma questa campagna')).toBe(false);
  });
});

describe('ops detection', () => {
  it('detects commercial ops phrases', () => {
    expect(detectOperatorOpsAction('rispondi a telegram')).toBe('reply_telegram');
    expect(detectOperatorOpsAction('prendi in carico')).toBe('take_over');
    expect(detectOperatorOpsAction('aggiungi disponibilità domani alle 15:00')).toBe('create_slot');
    expect(detectOperatorOpsAction('annulla appuntamento')).toBe('cancel_appointment');
    expect(detectOperatorOpsAction('ferma automazione')).toBe('stop_automation');
    expect(detectOperatorOpsAction('cliente Da Mario chiuso e pagato')).toBe('close_won');
    expect(detectOperatorOpsAction('non rispondo, archivia')).toBe('archive_thread');
    expect(detectOperatorOpsAction('cancella questa conversazione')).toBe('drop_thread');
    expect(detectOperatorOpsAction('togli dalla coda')).toBe('dismiss_todo');
    expect(detectOperatorOpsAction('cancella questa campagna')).toBe('none');
    expect(detectOperatorOpsAction('cancellala')).toBe('none');
    expect(detectOperatorOpsAction('cancellala', { entityType: 'thread' })).toBe('drop_thread');
    expect(detectOperatorOpsAction('archivia', { entityType: 'thread' })).toBe('archive_thread');
    expect(extractNamedLeadHint('cliente Da Mario chiuso e pagato')).toBe('Da Mario');
    expect(
      closeOutSummary({
        kind: 'archive',
        leadId: '1',
        threadId: '2',
        leadName: 'Da Mario',
      }),
    ).toMatch(/Non rispondo a «Da Mario»/);
    expect(detectOperatorOpsAction('fai partire telegeram')).toBe('start_telegram');
    expect(
      detectOperatorOpsAction(
        'modalità autonoma, prezzo minimo 700, prezzo standard 1000, sconto massimo 15',
      ),
    ).toBe('update_playbook');
  });

  it('ricorda solo preferenze esplicite e non segreti', () => {
    expect(extractOperatorPreference('Ricordati che preferisco risposte brevi')).toBe(
      'preferisco risposte brevi',
    );
    expect(extractOperatorPreference('Ricordati che la password è abc')).toBeNull();
  });

  it('apre direttamente le sezioni richieste', () => {
    expect(navigationActionForQuestion('Apri i messaggi Telegram')).toMatchObject({
      type: 'open_page',
      page: 'telegram-messages',
    });
    expect(navigationActionForQuestion('Portami ai contatti')).toMatchObject({
      type: 'open_page',
      page: 'leads',
    });
    expect(navigationActionForQuestion('Apri sicurezza')).toMatchObject({
      type: 'open_page',
      page: 'security',
    });
  });

  it('traduce un comando semplice in regole commerciali editabili', () => {
    const result = applyPlaybookCommand(
      DEFAULT_PLAYBOOK,
      'modalità autonoma, prezzo minimo 700, prezzo standard 1000, sconto massimo 15',
    );
    expect(result.playbook.autonomy.firstReplyMode).toBe('AUTO_ALLOWED');
    expect(result.playbook.pricing).toMatchObject({
      min: 700,
      max: 1000,
      aiMayCommunicate: true,
      mode: 'range',
    });
    expect(result.playbook.discount).toMatchObject({ allowed: true, maxAutomatic: 15 });
    expect(result.changes).toHaveLength(4);
  });
});

describe('europe/rome datetime parsing', () => {
  it('parses domani alle 15:00 without hardcoded UTC-2', () => {
    const now = new Date('2026-08-25T10:00:00.000Z');
    const parsed = parseEuropeRomeDateTime('aggiungi disponibilità domani alle 15:00', now);
    expect(parsed).not.toBeNull();
    expect(parsed!.label).toContain('domani');
    expect(parsed!.label).toContain('15:00');
    const label = formatEuropeRome(parsed!.startsAt);
    expect(label).toMatch(/15:00/);
  });

  it('parses explicit day/month', () => {
    const parsed = parseEuropeRomeDateTime('slot 27/08 11:30', new Date('2026-08-25T10:00:00.000Z'));
    expect(parsed).not.toBeNull();
    expect(parsed!.label).toContain('11:30');
  });
});

describe('calendar planning and grounding', () => {
  it('plans calendar summary for appointment questions', () => {
    const plan = planOperatorTurnMock({
      question: 'quanti appuntamenti ho?',
      refs: emptyEntityRefs(),
      envelope: { route: '/overview', entityType: 'none', entityId: null },
    });
    expect(plan.toolCalls.some((t) => t.name === 'get_calendar_summary')).toBe(true);
  });

  it('maps /calendar focus to event envelope', () => {
    const env = envelopeFromPath('/calendar', 'focus=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(env.entityType).toBe('event');
    expect(env.entityId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('composes grounded calendar numbers without inventing totals', () => {
    const reply = composeOperatorReply(
      'quanti appuntamenti ho?',
      { route: '/overview', entityType: 'none', entityId: null },
      [
        {
          name: 'get_calendar_summary',
          result: {
            scheduledAppointments: 2,
            completedAppointments: 1,
            cancelledAppointments: 0,
            upcomingThisWeek: 2,
            availableSlots: 3,
            nextAppointments: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                label: 'mer 26/08, 13:19 · Demo',
                leadName: 'Attila-Lab',
              },
            ],
            periodLabel: 'prossimi 14 giorni',
          },
        },
      ],
      [],
      { kind: 'READ', city: null, category: null, limit: 8, deliveryMode: null, campaignHint: null, leadLimitRequested: false, writeVerb: null },
    );
    expect(reply.reply).toContain('2 appuntamenti fissati');
    expect(reply.reply).not.toContain('182');
    expect(reply.actions.some((a) => a.type === 'open_calendar')).toBe(true);
  });
});

describe('daily commercial briefing', () => {
  it('confronta i canali e consiglia quello con risultati migliori', () => {
    const briefing = buildDailyCommercialBriefing({
      now: new Date('2026-08-25T08:00:00.000Z'),
      messages: [
        { thread_id: 'e1', provider: 'resend', direction: 'OUTBOUND' },
        { thread_id: 'e1', provider: 'resend', direction: 'INBOUND' },
        { thread_id: 'e2', provider: 'resend', direction: 'OUTBOUND' },
        { thread_id: 'e2', provider: 'resend', direction: 'INBOUND' },
        { thread_id: 'e3', provider: 'resend', direction: 'OUTBOUND' },
        { thread_id: 't1', provider: 'telegram', direction: 'OUTBOUND' },
        { thread_id: 't2', provider: 'telegram', direction: 'OUTBOUND' },
        { thread_id: 't3', provider: 'telegram', direction: 'OUTBOUND' },
      ],
      bookedThreadIds: ['e1'],
      threadChannels: { e1: 'EMAIL' },
      appointments: [
        { starts_at: '2026-08-25T13:00:00.000Z', title: 'Call Trattoria Duomo' },
      ],
      hotThreads: 2,
      followUpsDue: 1,
      readyLeads: [
        { country: 'Italia', city: 'Milano' },
        { country: 'Italia', city: 'Milano' },
        { country: 'Francia', city: 'Parigi' },
      ],
    });
    expect(briefing.recommendation.channel).toBe('EMAIL');
    expect(briefing.recommendation.city).toBe('Milano');
    expect(briefing.today.appointments).toBe(1);
    expect(briefing.summary).toMatch(/Ciao Attilio.*email.*Milano/i);
  });

  it('“cosa mi consigli oggi” usa il briefing completo', () => {
    const plan = planOperatorTurnMock({
      question: 'Ciao Attila, cosa mi consigli di fare oggi?',
      refs: emptyEntityRefs(),
      envelope: { route: '/overview', entityType: 'none', entityId: null },
    });
    expect(plan.toolCalls.some((tool) => tool.name === 'get_daily_briefing')).toBe(true);
  });
});

describe('bozze visibili in chat', () => {
  it('mostra il testo preparato senza dichiararlo inviato', () => {
    const reply = composeOperatorReply(
      'fammi vedere la bozza della risposta',
      { route: '/inbox', entityType: 'thread', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      [
        {
          name: 'get_conversation',
          result: {
            threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            leadName: 'Cliente Demo',
            status: 'OPEN',
            messages: [],
            aiDraft: {
              understanding: 'Chiede informazioni sul servizio.',
              text: 'Buongiorno, le spiego volentieri come funziona.',
            },
          },
        },
      ],
      [],
      {
        kind: 'READ',
        city: null,
        category: null,
        limit: 8,
        deliveryMode: null,
        campaignHint: null,
        leadLimitRequested: false,
        writeVerb: null,
      },
    );
    expect(reply.reply).toContain('Bozza pronta (non inviata)');
    expect(reply.reply).toContain('Buongiorno, le spiego volentieri');
  });
});

describe('natural language demo batches', () => {
  it.each([
    'prepara 10 demo',
    'mi servirebbero dieci anteprime per le attività migliori',
    'puoi fare 10 proposte visive per i ristoranti?',
  ])('comprende l’obiettivo senza richiedere un comando rigido: %s', (question) => {
    const intent = classifyOperatorIntent(question);
    const plan = planOperatorTurnMock({
      question,
      refs: emptyEntityRefs(),
      envelope: { route: '/overview', entityType: 'none', entityId: null },
    });
    expect(intent.kind).toBe('PREPARE');
    expect(intent.limit).toBe(10);
    expect(plan.safetyClass).toBe('PREPARE');
    expect(plan.prepareKind).toBe('campaign');
    expect(plan.toolCalls).toContainEqual(
      expect.objectContaining({
        name: 'search_leads',
        limit: 10,
      }),
    );
  });

  it('deduce anche il settore espresso naturalmente', () => {
    const plan = planOperatorTurnMock({
      question: 'vorrei cinque demo per dentisti',
      refs: emptyEntityRefs(),
      envelope: { route: '/overview', entityType: 'none', entityId: null },
    });
    expect(plan.toolCalls).toContainEqual(
      expect.objectContaining({
        name: 'search_leads',
        category: 'dentist',
        limit: 5,
      }),
    );
  });
});

describe('campagna autonoma con discovery', () => {
  it('cerca su Google e prepara la campagna quando il database locale è vuoto', async () => {
    const persist: PersistAiRun = async (input) =>
      ({
        id: 'run-discovery',
        model: input.model,
        taskType: input.taskType,
        provider: input.provider,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: 0,
        outputTokens: input.usage.outputTokens,
        estimatedCostUsd: input.estimatedCostUsd,
        latencyMs: 0,
        status: input.status,
        createdAt: new Date().toISOString(),
      }) satisfies AiRunPublic;
    const data = createMemoryOperatorData();
    data.searchLeads = async () => [];
    let discoveredTarget: { category: string; location: string } | null = null;
    let preparedLeadIds: string[] = [];

    const result = await collectOperatorTurn({
      workspaceId: 'ws',
      sessionId: 'sess',
      question: 'crea campagna su ristoranti a crema?',
      envelope: { route: '/overview', entityType: 'none', entityId: null },
      data,
      persist,
      env: { ...process.env, AI_COMMERCIAL_MODE: 'mock' },
      writes: {
        discover: async ({ category, location }) => {
          discoveredTarget = { category, location };
          return {
            found: 1,
            created: 1,
            duplicates: 0,
            qualified: 1,
            leads: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                name: 'Ristorante Crema',
                city: 'Crema',
                category: 'restaurant',
                discoveryScore: 90,
                qualificationStatus: 'PREQUALIFIED',
                websiteUrl: 'https://example.com',
              },
            ],
          };
        },
        prepare: async ({ leads }) => {
          preparedLeadIds = leads.map((lead) => lead.id);
          return [
            {
              tool: 'create_campaign',
              ok: true,
              summary: 'Invio email creato.',
              data: {
                campaignId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                leadCount: leads.length,
                skipped: 0,
              },
            },
          ];
        },
      },
    });

    expect(discoveredTarget).toEqual({ category: 'restaurant', location: 'crema' });
    expect(preparedLeadIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(result.reply).toContain('Ricerca Google completata');
    expect(result.reply).toContain('Invio email creato');
  });
});

describe('operator turn calendar read', () => {
  it('answers appointment count from calendar summary tool', async () => {
    const persist: PersistAiRun = async (input) =>
      ({
        id: 'run-cal',
        model: input.model,
        taskType: input.taskType,
        provider: input.provider,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: 0,
        outputTokens: input.usage.outputTokens,
        estimatedCostUsd: input.estimatedCostUsd,
        latencyMs: 0,
        status: input.status,
        createdAt: new Date().toISOString(),
      }) satisfies AiRunPublic;

    const data = createMemoryOperatorData();
    data.getCalendarSummary = async () => ({
      scheduledAppointments: 2,
      completedAppointments: 0,
      cancelledAppointments: 1,
      upcomingThisWeek: 2,
      availableSlots: 4,
      nextAppointments: [],
      periodLabel: 'prossimi 14 giorni',
    });

    const result = await collectOperatorTurn({
      workspaceId: 'ws',
      sessionId: 'sess',
      question: 'quanti appuntamenti ho in calendario?',
      envelope: { route: '/overview', entityType: 'none', entityId: null },
      data,
      persist,
      env: { ...process.env, AI_COMMERCIAL_MODE: 'mock' },
    });
    expect(result.reply.toLowerCase()).toMatch(/2/);
    expect(result.reply).not.toMatch(/182/);
  });
});

describe('close-out operativo', () => {
  it('Attila chiude il cliente pagato senza toccare le campagne', async () => {
    const persist: PersistAiRun = async (input) =>
      ({
        id: 'run-close',
        model: input.model,
        taskType: input.taskType,
        provider: input.provider,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: 0,
        outputTokens: input.usage.outputTokens,
        estimatedCostUsd: input.estimatedCostUsd,
        latencyMs: 0,
        status: input.status,
        createdAt: new Date().toISOString(),
      }) satisfies AiRunPublic;

    let ran: string | null = null;
    let mutated = false;
    const result = await collectOperatorTurn({
      workspaceId: 'ws',
      sessionId: 'sess',
      question: 'cliente Da Mario chiuso e pagato',
      envelope: { route: '/inbox', entityType: 'thread', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      data: createMemoryOperatorData(),
      persist,
      env: { AI_PROVIDER_MODE: 'mock' } as unknown as NodeJS.ProcessEnv,
      writes: {
        runOps: async (action) => {
          ran = action;
          return {
            tool: 'close_won',
            ok: true,
            summary: '«Da Mario» è chiuso e pagato. L’ho tolto dalle code e fermato i solleciti.',
            data: { threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', href: '/inbox' },
          };
        },
        campaignMutation: async () => {
          mutated = true;
          return [{ tool: 'campaign_mutation', ok: false, summary: 'non dovevo', data: {} }];
        },
      },
    });
    expect(ran).toBe('close_won');
    expect(mutated).toBe(false);
    expect(result.reply).toMatch(/chiuso e pagato/);
  });

  it('classifica archivia campagna come azione distruttiva confermata', () => {
    expect(classifyOperatorIntent('archivia questa campagna').kind).toBe('DESTRUCTIVE');
    expect(classifyOperatorIntent('non rispondo archivia').kind).not.toBe('DESTRUCTIVE');
  });

  it('spiega in italiano semplice perché Attila a volte non risponde', async () => {
    expect(
      isAttilaAvailabilityQuestion('Modalità AI temporaneamente non disponibile perche?'),
    ).toBe(true);
    expect(
      isAttilaAvailabilityQuestion('perché?', [
        { role: 'assistant', content: ATTILA_UNAVAILABLE_REPLY },
      ]),
    ).toBe(true);
    expect(isAttilaAvailabilityQuestion('perché questa campagna è bloccata?')).toBe(false);

    const persist: PersistAiRun = async (input) =>
      ({
        id: 'run-ai-down',
        model: input.model,
        taskType: input.taskType,
        provider: input.provider,
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: 0,
        outputTokens: input.usage.outputTokens,
        estimatedCostUsd: input.estimatedCostUsd,
        latencyMs: 0,
        status: input.status,
        createdAt: new Date().toISOString(),
      }) satisfies AiRunPublic;

    const result = await collectOperatorTurn({
      workspaceId: 'ws',
      sessionId: 'sess',
      question: 'Modalità AI temporaneamente non disponibile perche?',
      envelope: { route: '/overview', entityType: 'none', entityId: null },
      data: createMemoryOperatorData(),
      persist,
      env: { AI_PROVIDER_MODE: 'mock' } as unknown as NodeJS.ProcessEnv,
    });
    expect(result.reply).toMatch(/non dipende dalle campagne/i);
    expect(result.reply).not.toMatch(/blocker|slot|modalità ai/i);
    expect(result.events.some((event) => event.type === 'tool_start' && event.name === 'get_blockers')).toBe(
      false,
    );
  });
});
