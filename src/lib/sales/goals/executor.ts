import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { CommercialGoalPlanRow, CommercialGoalRow } from '@/lib/types/database';
import { createCampaignWithLeads } from '@/lib/campaigns/materialize';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { createSendPending, recordAiAudit } from '@/lib/ai/operator/writes';
import {
  getToolContract,
  resolveGoalScopedExecution,
  type ExecutionTier,
} from '@/lib/ai/operator/tool-contracts';
import { getEmailReplyPathReadiness } from '@/lib/inbound/email-readiness';
import { runLeadDiscovery } from '@/lib/leads/discovery';
import { runProactiveSalesStep } from '@/lib/sales/proactive';
import {
  appendGoalEvent,
  linkGoalEntity,
} from './store';
import type { GoalActionPlan } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionTool(action: GoalActionPlan): string {
  if (action.type === 'START_CAMPAIGN') return 'send_campaign';
  if (action.type === 'FOLLOW_UP') return 'reply_telegram';
  if (action.type === 'PREPARE_DEMOS') return 'prepare_campaign';
  if (action.type === 'RESEARCH_SEGMENT') return 'create_campaign';
  return action.type.toLowerCase();
}

async function executionContext(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  action: GoalActionPlan,
  env: NodeJS.ProcessEnv,
) {
  const constraints = asRecord(goal.constraints);
  const dailyLimit = Math.max(1, Number(constraints.dailySendLimit ?? 50));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [{ data: policy }, messageCount] = await Promise.all([
    admin
      .from('ai_autonomy_policies')
      .select('id')
      .eq('workspace_id', goal.workspace_id)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle(),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', goal.workspace_id)
      .eq('direction', 'OUTBOUND')
      .gte('created_at', start.toISOString()),
  ]);
  const tool = actionTool(action);
  const contract = getToolContract(tool);
  const tier: ExecutionTier =
    contract?.tier ??
    (action.safety === 'EXTERNAL'
      ? 'CONFIRM_EXTERNAL'
      : action.safety === 'HUMAN'
        ? 'DENIED'
        : 'INTERNAL');
  return {
    tool,
    decision: resolveGoalScopedExecution({
      mode: goal.mode,
      tier,
      autonomyActive:
        Boolean(policy) && env.ATTILA_GOAL_AUTOPILOT_ENABLED?.toLowerCase() === 'true',
      sendGuardReady: getEmailReplyPathReadiness(env).ready,
      withinDailyLimit: (messageCount.count ?? 0) < dailyLimit,
      shadowMode: constraints.shadowMode !== false,
      escalation: action.safety === 'HUMAN',
    }),
  };
}

async function selectBestLeadIds(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  limit: number,
): Promise<string[]> {
  const market = asRecord(goal.market);
  let query = admin
    .from('leads')
    .select('id')
    .eq('workspace_id', goal.workspace_id)
    .in('qualification_status', ['PREQUALIFIED', 'NEEDS_ANALYSIS'])
    .not('business_status', 'in', '(WON,LOST,DO_NOT_CONTACT)')
    .order('discovery_score', { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(50, limit)));
  if (typeof market.city === 'string' && market.city) query = query.ilike('city', market.city);
  if (typeof market.category === 'string' && market.category) {
    query = query.ilike('category', market.category);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Selezione lead goal: ${error.message}`);
  return (data ?? []).map((lead) => lead.id);
}

async function prepareGoalCampaign(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  plan: CommercialGoalPlanRow,
  action: GoalActionPlan,
): Promise<string> {
  const limit = Number(action.params.limit ?? 10);
  const leadIds = await selectBestLeadIds(admin, goal, limit);
  if (!leadIds.length) return 'NO_ELIGIBLE_LEADS';
  const constraints = asRecord(goal.constraints);
  const created = await createCampaignWithLeads(admin, goal.workspace_id, {
    name: `Goal · ${goal.title} · piano ${plan.version}`,
    leadIds,
    deliveryMode: 'PRODUCTION',
    mode: 'MANUAL',
    dailySendLimit: Math.max(1, Number(constraints.dailySendLimit ?? 50)),
  });
  await linkGoalEntity(admin, {
    workspaceId: goal.workspace_id,
    goalId: goal.id,
    entityType: 'campaign',
    entityId: created.campaignId,
    role: 'PRIMARY',
  });
  for (const leadId of leadIds) {
    await linkGoalEntity(admin, {
      workspaceId: goal.workspace_id,
      goalId: goal.id,
      entityType: 'lead',
      entityId: leadId,
      role: 'PROSPECT',
    });
  }
  const prepared = await enqueueCampaignPreparation(admin, goal.workspace_id, created.campaignId);
  await recordAiAudit(admin, {
    workspaceId: goal.workspace_id,
    actor: 'AI',
    tool: 'prepare_campaign',
    action: 'goal_prepare',
    entityType: 'campaign',
    entityId: created.campaignId,
    result: { goalId: goal.id, planId: plan.id, actionId: action.id, enqueued: prepared.enqueued },
  });
  return `CAMPAIGN_PREPARING:${created.campaignId}:${prepared.enqueued}`;
}

async function executeStartCampaign(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  plan: CommercialGoalPlanRow,
  action: GoalActionPlan,
  decision: 'ALLOW' | 'CONFIRM',
): Promise<string> {
  const { data: links } = await admin
    .from('commercial_goal_links')
    .select('entity_id')
    .eq('goal_id', goal.id)
    .eq('entity_type', 'campaign')
    .order('created_at', { ascending: false })
    .limit(1);
  const campaignId = links?.[0]?.entity_id;
  if (!campaignId) return prepareGoalCampaign(admin, goal, plan, action);
  const { count } = await admin
    .from('campaign_leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['REVIEW', 'READY']);
  if (!count) return `AWAITING_CAMPAIGN_PREPARATION:${campaignId}`;
  if (decision === 'CONFIRM') {
    const pending = await createSendPending({
      admin,
      workspaceId: goal.workspace_id,
      campaignId,
    });
    return pending.ok
      ? `HUMAN_CONFIRMATION_REQUIRED:${String(pending.data.pendingActionId ?? '')}`
      : `CONFIRMATION_FAILED:${pending.summary}`;
  }
  const result = await approveCampaignLeads(admin, goal.workspace_id, campaignId);
  await recordAiAudit(admin, {
    workspaceId: goal.workspace_id,
    actor: 'AI',
    tool: 'send_campaign',
    action: 'goal_autopilot_execute',
    entityType: 'campaign',
    entityId: campaignId,
    result: { goalId: goal.id, planId: plan.id, actionId: action.id, ...result },
  });
  return `SEND_ENQUEUED:${campaignId}:${result.approved}`;
}

export async function executeGoalPlan(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  plan: CommercialGoalPlanRow,
  actions: GoalActionPlan[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<Array<{ actionId: string; result: string }>> {
  const results: Array<{ actionId: string; result: string }> = [];
  for (const action of [...actions].sort((a, b) => b.priority - a.priority).slice(0, 2)) {
    const gate = await executionContext(admin, goal, action, env);
    let result = gate.decision.reason;
    if (gate.decision.decision === 'ALLOW') {
      if (action.type === 'RESEARCH_SEGMENT') {
        const market = asRecord(goal.market);
        const category = String(market.category ?? goal.offer_key);
        const location = String(market.city ?? market.country ?? '');
        if (!location) {
          result = 'MARKET_LOCATION_REQUIRED';
        } else {
          const discovered = await runLeadDiscovery(
            {
              category,
              location,
              maxResults: Math.min(50, Number(action.params.limit ?? 30)),
            },
            env,
            { admin, workspaceId: goal.workspace_id },
          );
          for (const lead of discovered.leads) {
            await linkGoalEntity(admin, {
              workspaceId: goal.workspace_id,
              goalId: goal.id,
              entityType: 'lead',
              entityId: lead.id,
              role: 'DISCOVERED',
            });
          }
          result = `DISCOVERY:${discovered.created}:${discovered.qualified}`;
        }
      } else if (action.type === 'PREPARE_DEMOS') {
        result = await prepareGoalCampaign(admin, goal, plan, action);
      } else if (action.type === 'START_CAMPAIGN') {
        result = await executeStartCampaign(admin, goal, plan, action, 'ALLOW');
      } else if (action.type === 'FOLLOW_UP') {
        const { data: threads } = await admin
          .from('message_threads')
          .select('id')
          .eq('workspace_id', goal.workspace_id)
          .in('commercial_state', ['REPLIED', 'ENGAGED', 'INTERESTED', 'NEEDS_REPLY'])
          .limit(Math.min(10, Number(action.params.limit ?? 5)));
        let completed = 0;
        for (const thread of threads ?? []) {
          await runProactiveSalesStep({
            admin,
            workspaceId: goal.workspace_id,
            threadId: thread.id,
          });
          completed += 1;
        }
        result = `FOLLOW_UP_PROCESSED:${completed}`;
      } else if (action.type === 'WAIT') {
        result = 'WAITING_FOR_EVIDENCE';
      }
    } else if (
      gate.decision.decision === 'CONFIRM' &&
      action.type === 'START_CAMPAIGN'
    ) {
      result = await executeStartCampaign(admin, goal, plan, action, 'CONFIRM');
    }
    await appendGoalEvent(admin, {
      workspaceId: goal.workspace_id,
      goalId: goal.id,
      planId: plan.id,
      actor: 'AI',
      eventType: 'ACTION_DECIDED',
      payload: {
        actionId: action.id,
        actionType: action.type,
        tool: gate.tool,
        gate: gate.decision,
        result,
      },
    });
    results.push({ actionId: action.id, result });
    if (action.type === 'REQUEST_HUMAN' || result.startsWith('HUMAN_CONFIRMATION')) break;
  }
  return results;
}
