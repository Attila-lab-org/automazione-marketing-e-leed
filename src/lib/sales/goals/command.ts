import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { CommercialGoalMetric, CommercialGoalMode } from '@/lib/types/database';
import type { WriteResult } from '@/lib/ai/operator/writes';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import {
  appendGoalEvent,
  createCommercialGoal,
  getActiveCommercialGoal,
  transitionCommercialGoal,
} from './store';

const NUMBER_WORDS: Array<[RegExp, number]> = [
  [/\bventi\b/i, 20],
  [/\bquindici\b/i, 15],
  [/\bdieci\b/i, 10],
  [/\botto\b/i, 8],
  [/\bcinque\b/i, 5],
  [/\bquattro\b/i, 4],
  [/\btre\b/i, 3],
  [/\bdue\b/i, 2],
  [/\bun[oa]?\b/i, 1],
];

function targetFromText(text: string): number | null {
  const digit = text.match(/\b(\d{1,4})\b/);
  if (digit) return Number(digit[1]);
  return NUMBER_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function deadlineFromText(text: string, now = new Date()): Date {
  const days = text.match(/entro\s+(\d{1,3})\s+giorn/i);
  if (days) return new Date(now.getTime() + Number(days[1]) * 86_400_000);
  if (/questo mese|entro fine mese/i.test(text)) {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }
  return new Date(now.getTime() + 30 * 86_400_000);
}

function metricFromText(text: string): CommercialGoalMetric | null {
  if (/client|vendit|contratt|chiusur/.test(text)) return 'DEALS_WON';
  if (/appuntament|call|riunion/.test(text)) return 'APPOINTMENTS_BOOKED';
  if (/rispost[ae] positiv|interessat/.test(text)) return 'POSITIVE_REPLIES';
  if (/lead|prospect|attivit[àa] qualificat/.test(text)) return 'QUALIFIED_LEADS';
  return null;
}

export type ParsedCommercialGoal = {
  target: number;
  metric: CommercialGoalMetric;
  offer: string;
  deadline: string;
  city: string | null;
  category: string | null;
  mode: CommercialGoalMode;
};

export function parseCommercialGoal(text: string, now = new Date()): ParsedCommercialGoal | null {
  const normalized = text.trim();
  if (!/\b(voglio|obiettivo|target|portami|ottenere|prendere|acquisire)\b/i.test(normalized)) {
    return null;
  }
  const target = targetFromText(normalized);
  const metric = metricFromText(normalized.toLowerCase());
  if (!target || !metric) return null;
  const offerMatch = normalized.match(
    /(?:per|vendendo|di)\s+((?:siti?|website|e-?commerce|automazion|booking|assistente ai)[^,.;]*)/i,
  );
  const offer =
    offerMatch?.[1]
      ?.replace(
        /\s+(?:a|su|zona)\s+(?:milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona).*$/i,
        '',
      )
      .trim() ?? (metric === 'DEALS_WON' ? 'servizio commerciale' : 'offerta principale');
  const cityMatch = normalized.match(
    /\b(?:a|su|zona)\s+(milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona)\b/i,
  );
  const categoryMatch = normalized.match(
    /\b(ristoranti?|dentisti?|hotel|palestre?|parrucchieri?|centri estetici|bar)\b/i,
  );
  const mode: CommercialGoalMode = /fai tu|autopilot|automaticamente|autonom/i.test(normalized)
    ? 'AUTOPILOT'
    : /solo consigli|non fare nulla|modalit[àa] ask/i.test(normalized)
      ? 'ASK'
      : 'DO';
  return {
    target,
    metric,
    offer,
    deadline: deadlineFromText(normalized, now).toISOString(),
    city: cityMatch?.[1] ?? null,
    category: categoryMatch?.[1] ?? null,
    mode,
  };
}

export async function executeCommercialGoalCommand(input: {
  admin: AppSupabaseClient;
  workspaceId: string;
  question: string;
}): Promise<WriteResult | null> {
  const q = input.question.trim();
  const active = await getActiveCommercialGoal(input.admin, input.workspaceId);
  if (active && /\b(pausa|sospendi|ferma)\b.*\b(obiettivo|goal|autopilot)\b/i.test(q)) {
    const goal = await transitionCommercialGoal(
      input.admin,
      input.workspaceId,
      active.id,
      'PAUSED',
      'HUMAN',
      q,
    );
    return {
      tool: 'pause_commercial_goal',
      ok: true,
      summary: `Ho messo in pausa “${goal.title}”. Nessuna nuova azione verrà avviata.`,
      data: { goalId: goal.id },
    };
  }
  if (/\b(riprendi|riattiva)\b.*\b(obiettivo|goal|autopilot)\b/i.test(q)) {
    const { data: resumable } = active
      ? { data: active }
      : await input.admin
          .from('commercial_goals')
          .select('*')
          .eq('workspace_id', input.workspaceId)
          .in('status', ['PAUSED', 'BLOCKED'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
    if (!resumable) return null;
    const goal = await transitionCommercialGoal(
      input.admin,
      input.workspaceId,
      resumable.id,
      'ACTIVE',
      'HUMAN',
      q,
    );
    return {
      tool: 'resume_commercial_goal',
      ok: true,
      summary: `Ho ripreso “${goal.title}”. Il prossimo controllo è già programmato.`,
      data: { goalId: goal.id },
    };
  }
  if (
    active &&
    /\b(?:ask|do|autopilot|modalit[àa]\s+(?:autonom|assistit|equilibrat)|modo\s+(?:autonom|assistit|equilibrat)|fai tu)\b/i.test(
      q,
    )
  ) {
    const explicit = q.match(/\b(ask|do|autopilot)\b/i)?.[1]?.toUpperCase();
    const requested = (
      explicit ??
      (/autonom|fai tu/i.test(q) ? 'AUTOPILOT' : /assistit/i.test(q) ? 'ASK' : 'DO')
    ) as CommercialGoalMode;
    if (requested) {
      const { data, error } = await input.admin
        .from('commercial_goals')
        .update({ mode: requested, updated_at: new Date().toISOString() })
        .eq('workspace_id', input.workspaceId)
        .eq('id', active.id)
        .select('*')
        .single();
      if (error || !data) throw new Error(`Modalità goal: ${error?.message ?? 'fallita'}`);
      await appendGoalEvent(input.admin, {
        workspaceId: input.workspaceId,
        goalId: active.id,
        actor: 'HUMAN',
        eventType: 'GOAL_MODE_CHANGED',
        payload: { from: active.mode, to: requested },
      });
      return {
        tool: 'update_commercial_goal',
        ok: true,
        summary: `Modalità ${requested} attiva per “${active.title}”.`,
        data: { goalId: active.id, mode: requested },
      };
    }
  }

  const parsed = parseCommercialGoal(q);
  if (!parsed) return null;
  const goal = await createCommercialGoal(input.admin, input.workspaceId, {
    title: `${parsed.target} ${parsed.metric.toLowerCase().replaceAll('_', ' ')} · ${parsed.offer}`,
    offerKey: parsed.offer,
    targetMetric: parsed.metric,
    targetValue: parsed.target,
    deadline: parsed.deadline,
    market: { city: parsed.city, category: parsed.category },
    mode: parsed.mode,
    constraints: { dailySendLimit: 50, requireDemo: true, shadowMode: true },
  });
  const queue = new SupabaseJobQueue(input.admin);
  const tick = await queue.enqueue({
    workspaceId: input.workspaceId,
    jobType: 'COMMERCIAL_GOAL_TICK',
    entityType: 'commercial_goal',
    entityId: goal.id,
    idempotencyKey: `COMMERCIAL_GOAL_TICK:${goal.id}:initial`,
    inputSnapshot: { goalId: goal.id, trigger: 'operator' },
    priority: 10,
  });
  return {
    tool: 'create_commercial_goal',
    ok: true,
    summary: `Obiettivo salvato: ${goal.target_value} ${goal.target_metric.toLowerCase().replaceAll('_', ' ')} entro ${new Date(goal.deadline).toLocaleDateString('it-IT')}. Modalità ${goal.mode}; primo piano in elaborazione.`,
    data: { goalId: goal.id, mode: goal.mode, tickJobId: tick.job.id },
  };
}
