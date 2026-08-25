import { describe, expect, it } from 'vitest';
import { TOOL_CONTRACTS, contractsByTier, getToolContract, isConfirmTier } from '../../src/lib/ai/operator/tool-contracts';
import { detectOperatorOpsAction } from '../../src/lib/ai/operator/ops-writes';
import { parseEuropeRomeDateTime, formatEuropeRome } from '../../src/lib/ai/operator/time';
import { planOperatorTurnMock } from '../../src/lib/ai/operator/semantic-plan';
import { envelopeFromPath } from '../../src/lib/ai/operator/envelope';
import { emptyEntityRefs } from '../../src/lib/ai/operator/context';
import { composeOperatorReply } from '../../src/lib/ai/operator/compose';
import { createMemoryOperatorData } from '../../src/lib/ai/operator/data';
import { collectOperatorTurn } from '../../src/lib/ai/operator/turn';
import type { PersistAiRun } from '../../src/lib/ai/persist';
import type { AiRunPublic } from '../../src/lib/ai/types';

describe('tool contracts', () => {
  it('marks external and irreversible ops as confirm tiers', () => {
    expect(getToolContract('reply_telegram')?.tier).toBe('CONFIRM_EXTERNAL');
    expect(getToolContract('cancel_appointment')?.tier).toBe('CONFIRM_IRREVERSIBLE');
    expect(getToolContract('pause_campaign')?.tier).toBe('CONFIRM_IRREVERSIBLE');
    expect(getToolContract('create_calendar_slot')?.tier).toBe('INTERNAL');
    expect(getToolContract('send_email')?.tier).toBe('DENIED');
    expect(isConfirmTier('CONFIRM_EXTERNAL')).toBe(true);
    expect(contractsByTier('READ').length).toBeGreaterThan(10);
    expect(Object.keys(TOOL_CONTRACTS).length).toBeGreaterThan(20);
  });
});

describe('ops detection', () => {
  it('detects commercial ops phrases', () => {
    expect(detectOperatorOpsAction('rispondi a telegram')).toBe('reply_telegram');
    expect(detectOperatorOpsAction('prendi in carico')).toBe('take_over');
    expect(detectOperatorOpsAction('aggiungi disponibilità domani alle 15:00')).toBe('create_slot');
    expect(detectOperatorOpsAction('annulla appuntamento')).toBe('cancel_appointment');
    expect(detectOperatorOpsAction('ferma automazione')).toBe('stop_automation');
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
