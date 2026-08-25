import { describe, expect, it } from 'vitest';
import { isPublicApi } from '../../src/lib/auth/constants';
import { hrefForAction, operatorActionSchema, parseOperatorActions } from '../../src/lib/ai/operator/actions';
import { composeOperatorReply } from '../../src/lib/ai/operator/compose';
import { createMemoryOperatorData } from '../../src/lib/ai/operator/data';
import { envelopeFromPath } from '../../src/lib/ai/operator/envelope';
import {
  executeOperatorTool,
  operatorTaskType,
  suggestOperatorTools,
} from '../../src/lib/ai/operator/registry';
import { collectOperatorTurn } from '../../src/lib/ai/operator/turn';
import { assertNoSecrets } from '../../src/lib/ai/readiness';
import type { AiRunPublic } from '../../src/lib/ai/types';
import type { PersistAiRun } from '../../src/lib/ai/persist';

const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MILANO_TOP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MILANO_LOW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ROMA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function env(partial: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { AI_PROVIDER_MODE: 'mock', ...partial } as unknown as NodeJS.ProcessEnv;
}

function memoryPersist(): { persist: PersistAiRun; rows: AiRunPublic[] } {
  const rows: AiRunPublic[] = [];
  const persist: PersistAiRun = async (input) => {
    const row: AiRunPublic = {
      id: `run-${rows.length + 1}`,
      model: input.model,
      taskType: input.taskType,
      provider: input.provider,
      inputTokens: input.usage.inputTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      outputTokens: input.usage.outputTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      latencyMs: input.latencyMs,
      status: input.status,
      createdAt: new Date().toISOString(),
    };
    rows.push(row);
    return row;
  };
  return { persist, rows };
}

const data = createMemoryOperatorData({
  leads: [
    {
      id: MILANO_TOP,
      name: 'Trattoria Duomo',
      city: 'Milano',
      category: 'restaurant',
      discoveryScore: 91,
      qualificationStatus: 'PREQUALIFIED',
      websiteUrl: null,
    },
    {
      id: MILANO_LOW,
      name: 'Pizzeria Navigli',
      city: 'Milano',
      category: 'pizza_restaurant',
      discoveryScore: 70,
      qualificationStatus: 'PREQUALIFIED',
      websiteUrl: null,
    },
    {
      id: ROMA_ID,
      name: 'Osteria Roma',
      city: 'Roma',
      category: 'restaurant',
      discoveryScore: 99,
      qualificationStatus: 'PREQUALIFIED',
      websiteUrl: null,
    },
  ],
  campaigns: [
    {
      id: CAMPAIGN_ID,
      name: 'Ristoranti Milano TEST',
      status: 'PAUSED',
      mode: 'MANUAL',
      deliveryMode: 'TEST',
      createdAt: '2026-08-20T10:00:00.000Z',
      totals: { leads: 12, review: 4, failed: 2 },
    },
  ],
  blockers: [
    {
      kind: 'CAMPAIGN_PAUSED',
      label: 'La campagna «Ristoranti Milano TEST» è in pausa',
      entityId: CAMPAIGN_ID,
      entityName: 'Ristoranti Milano TEST',
    },
    {
      kind: 'PREPARATION_FAILED',
      label: 'Preparazione ferma per sito non raggiungibile',
      entityId: CAMPAIGN_ID,
      entityName: 'Osteria Test',
    },
  ],
});

describe('AI-1 operator security', () => {
  it('chat operator non è una API pubblica', () => {
    expect(isPublicApi('/api/ai/operator/chat')).toBe(false);
    expect(isPublicApi('/api/ai/operator/sessions')).toBe(false);
  });

  it('tool non registrato e tool di scrittura sono negati', async () => {
    const envelope = envelopeFromPath('/overview');
    await expect(executeOperatorTool('sql_query', {}, data, envelope)).resolves.toMatchObject({
      ok: false,
      denied: true,
    });
    await expect(executeOperatorTool('send_email', {}, data, envelope)).resolves.toMatchObject({
      ok: false,
      denied: true,
    });
    await expect(executeOperatorTool('create_campaign', { name: 'x' }, data, envelope)).resolves.toMatchObject({
      ok: false,
      denied: true,
    });
  });

  it('tool read-only valido ha successo', async () => {
    const result = await executeOperatorTool('get_daily_report', { daysAgo: 1 }, data, envelopeFromPath('/overview'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toMatchObject({ period: { label: 'ieri' } });
    }
  });
});

describe('AI-1 grounding', () => {
  it('dichiara i dati mancanti invece di inventarli', () => {
    const daily = {
      period: {
        label: 'ieri' as const,
        startIso: 'x',
        endIso: 'y',
        timezone: 'Europe/Rome' as const,
      },
      metrics: {
        leadsFound: { available: true as const, value: 46 },
        qualified: { available: true as const, value: 18 },
        demosReady: { available: true as const, value: 11 },
        reviewEntered: { available: true as const, value: 7 },
        failedPreparations: { available: true as const, value: 2 },
        emailsSent: { available: false as const, reason: 'conteggio email inviate non disponibile' },
        replies: { available: false as const, reason: 'conteggio risposte non disponibile' },
      },
      failedSamples: [],
    };
    const reply = composeOperatorReply('Come è andata ieri?', envelopeFromPath('/overview'), [
      { name: 'get_daily_report', result: daily },
    ]);
    expect(reply.reply).toContain('46');
    expect(reply.reply).toMatch(/non è disponibile/i);
    expect(reply.reply).not.toMatch(/circa|stimo|probabilmente/i);
  });

  it('usa il campaign ID del contesto senza chiedere UUID', async () => {
    const { persist, rows } = memoryPersist();
    const envelope = envelopeFromPath(`/campaigns/${CAMPAIGN_ID}`);
    expect(envelope.entityId).toBe(CAMPAIGN_ID);
    const planned = suggestOperatorTools('Perché questa campagna è bloccata?', envelope);
    expect(planned.some((c) => c.name === 'get_campaign_detail' && c.args.campaignId === CAMPAIGN_ID)).toBe(
      true,
    );
    const result = await collectOperatorTurn({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      question: 'Perché questa campagna è bloccata?',
      envelope,
      data,
      persist,
      env: env(),
    });
    expect(result.reply).toContain('Ristoranti Milano TEST');
    expect(result.reply).toMatch(/pausa|blocker/i);
    expect(result.actions.some((a) => a.type === 'open_campaign' && a.campaignId === CAMPAIGN_ID)).toBe(
      true,
    );
    expect(rows[0]?.taskType).toBe('answer_operator');
    expect(result.run).not.toBeNull();
  });

  it('filtra i lead di Milano con lo score esistente', async () => {
    const { persist } = memoryPersist();
    const result = await collectOperatorTurn({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      question: 'Quali sono i migliori lead di Milano?',
      envelope: envelopeFromPath('/leads'),
      data,
      persist,
      env: env(),
    });
    expect(result.reply).toContain('Trattoria Duomo');
    expect(result.reply).toContain('91');
    expect(result.reply.indexOf('Trattoria Duomo')).toBeLessThan(result.reply.indexOf('Pizzeria Navigli'));
    expect(result.reply).not.toContain('Osteria Roma');
    const show = result.actions.find((a) => a.type === 'show_leads');
    expect(show?.type).toBe('show_leads');
    if (show?.type === 'show_leads') {
      expect(show.leadIds?.[0]).toBe(MILANO_TOP);
      expect(hrefForAction(show)).toContain('/leads');
    }
  });

  it('persiste ai_run e non espone segreti', async () => {
    const { persist, rows } = memoryPersist();
    const result = await collectOperatorTurn({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      question: 'Come è andata ieri?',
      envelope: envelopeFromPath('/overview'),
      data,
      persist,
      env: env({ OPENAI_API_KEY: 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaa' }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.taskType).toBe('answer_operator');
    expect(result.events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(result.events.some((e) => e.type === 'tool_done' && e.ok)).toBe(true);
    expect(() => assertNoSecrets(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(/sk-test/);
  });

  it('accetta solo action metadata tipizzata', () => {
    expect(operatorActionSchema.safeParse({ type: 'open_review', label: 'Apri Review' }).success).toBe(
      true,
    );
    expect(
      parseOperatorActions([{ type: 'open_campaign', href: 'https://evil.test', label: 'Apri' }]),
    ).toEqual([]);
  });

  it('non usa Sol per le domande operatore', () => {
    expect(operatorTaskType('Come è andata ieri?')).toBe('answer_operator_simple');
    expect(operatorTaskType('Perché questa campagna è bloccata?')).toBe('answer_operator');
  });
});
