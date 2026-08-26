import { createHash } from 'node:crypto';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { getEmailReplyPathReadiness } from '@/lib/inbound/email-readiness';
import type { CommercialGoalRow } from '@/lib/types/database';
import type { GoalMarket, GoalProgressSnapshot } from './types';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function progressPace(progressPct: number, elapsedPct: number): GoalProgressSnapshot['pace'] {
  if (progressPct >= elapsedPct + 10) return 'AHEAD';
  if (progressPct + 10 < elapsedPct) return 'BEHIND';
  return 'ON_TRACK';
}

export function hashGoalObservation(snapshot: GoalProgressSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export async function observeCommercialGoal(
  admin: AppSupabaseClient,
  goal: CommercialGoalRow,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<GoalProgressSnapshot> {
  const market = record(goal.market) as GoalMarket;
  let leadQuery = admin
    .from('leads')
    .select('id, qualification_status, business_status, updated_at')
    .eq('workspace_id', goal.workspace_id)
    .limit(3000);
  if (market.city) leadQuery = leadQuery.ilike('city', `%${market.city.replace(/[%_]/g, '')}%`);
  if (market.category) {
    leadQuery = leadQuery.ilike('category', `%${market.category.replace(/[%_]/g, '')}%`);
  }
  if (market.country) {
    leadQuery = leadQuery.ilike('country', `%${market.country.replace(/[%_]/g, '')}%`);
  }
  const { data: leadRows, error: leadError } = await leadQuery;
  if (leadError) throw new Error(`Osservazione lead: ${leadError.message}`);
  const leads = leadRows ?? [];
  const leadIds = leads.map((lead) => lead.id);
  const qualifiedLeads = leads.filter((lead) =>
    ['PREQUALIFIED', 'NEEDS_ANALYSIS'].includes(lead.qualification_status),
  ).length;
  const dealsWon = leads.filter(
    (lead) =>
      lead.business_status === 'WON' &&
      new Date(lead.updated_at).getTime() >= new Date(goal.starts_at).getTime(),
  ).length;

  let analyzedLeads = 0;
  let outboundMessages = 0;
  let positiveReplies = 0;
  let appointmentsBooked = 0;
  if (leadIds.length) {
    const ids = leadIds.slice(0, 1000);
    const [analyses, messages, threads, appointments] = await Promise.all([
      admin
        .from('website_analyses')
        .select('lead_id')
        .eq('workspace_id', goal.workspace_id)
        .in('lead_id', ids)
        .gte('created_at', goal.starts_at)
        .limit(3000),
      admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', goal.workspace_id)
        .in('lead_id', ids)
        .eq('direction', 'OUTBOUND')
        .gte('sent_at', goal.starts_at),
      admin
        .from('message_threads')
        .select('lead_id')
        .eq('workspace_id', goal.workspace_id)
        .in('lead_id', ids)
        .in('commercial_state', [
          'REPLIED',
          'ENGAGED',
          'QUALIFYING',
          'INTERESTED',
          'PRICING',
          'CALL_PROPOSED',
          'CALL_BOOKED',
          'WON',
        ])
        .gte('updated_at', goal.starts_at)
        .limit(3000),
      admin
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', goal.workspace_id)
        .in('lead_id', ids)
        .eq('event_type', 'APPOINTMENT')
        .neq('status', 'CANCELLED')
        .gte('created_at', goal.starts_at),
    ]);
    analyzedLeads = new Set((analyses.data ?? []).map((row) => row.lead_id)).size;
    outboundMessages = messages.count ?? 0;
    positiveReplies = new Set((threads.data ?? []).map((row) => row.lead_id)).size;
    appointmentsBooked = appointments.count ?? 0;
  }

  const { data: goalLinks } = await admin
    .from('commercial_goal_links')
    .select('entity_id')
    .eq('goal_id', goal.id)
    .eq('entity_type', 'campaign');
  const campaignIds = (goalLinks ?? []).map((link) => link.entity_id);
  let activeCampaigns = 0;
  if (campaignIds.length) {
    const { count } = await admin
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .in('id', campaignIds)
      .in('status', ['DRAFT', 'ACTIVE', 'PAUSED']);
    activeCampaigns = count ?? 0;
  }

  const actualByMetric = {
    DEALS_WON: dealsWon,
    APPOINTMENTS_BOOKED: appointmentsBooked,
    POSITIVE_REPLIES: positiveReplies,
    QUALIFIED_LEADS: qualifiedLeads,
  };
  const actual = actualByMetric[goal.target_metric];
  const target = Number(goal.target_value);
  const totalDuration = Math.max(1, new Date(goal.deadline).getTime() - new Date(goal.starts_at).getTime());
  const elapsed = Math.max(0, now.getTime() - new Date(goal.starts_at).getTime());
  const progressPct = Math.min(100, Math.round((actual / target) * 100));
  const elapsedPct = Math.min(100, Math.round((elapsed / totalDuration) * 100));
  const blockers: string[] = [];
  if (!leads.length) blockers.push('NO_MARKET_LEADS');
  if (leads.length && qualifiedLeads === 0) blockers.push('NO_QUALIFIED_LEADS');
  if (goal.mode === 'AUTOPILOT') {
    const replyPath = getEmailReplyPathReadiness(env);
    if (!replyPath.ready) blockers.push('EMAIL_REPLY_PATH_NOT_READY');
  }

  return {
    metric: goal.target_metric,
    target,
    actual,
    remaining: Math.max(0, target - actual),
    progressPct,
    elapsedPct,
    pace: progressPace(progressPct, elapsedPct),
    funnel: {
      leadsFound: leads.length,
      qualifiedLeads,
      analyzedLeads,
      activeCampaigns,
      outboundMessages,
      positiveReplies,
      appointmentsBooked,
      dealsWon,
    },
    blockers,
    observedAt: now.toISOString(),
  };
}

export type ProspectBrain = {
  lead: {
    id: string;
    name: string;
    city: string | null;
    category: string | null;
    businessStatus: string;
    score: number | null;
  };
  opportunity: Record<string, unknown> | null;
  demo: { id: string; publicPath: string | null; status: string } | null;
  conversation: {
    threadId: string | null;
    state: string | null;
    priority: string | null;
    need: string | null;
    objections: string[];
    nextStep: string | null;
  };
  engagement: {
    outboundMessages: number;
    inboundMessages: number;
    appointments: number;
  };
};

export async function getProspectBrain(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<ProspectBrain | null> {
  const { data: lead } = await admin
    .from('leads')
    .select(
      'id, name, city, category, business_status, discovery_score, primary_thread_id',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return null;
  const { data: threads } = await admin
    .from('message_threads')
    .select('id, commercial_state, priority, last_message_at')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(5);
  const thread =
    threads?.find((item) => item.id === lead.primary_thread_id) ?? threads?.[0] ?? null;
  const [analysisResult, demoResult, memoryResult, messagesResult, appointmentsResult] =
    await Promise.all([
      admin
        .from('website_analyses')
        .select('opportunity_score, confidence, strengths, issues, recommended_offer, recommended_approach')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('demo_sites')
        .select('id, public_url, status')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      thread
        ? admin
            .from('sales_thread_memory')
            .select('main_need, objections, next_step')
            .eq('thread_id', thread.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from('messages')
        .select('direction')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .limit(500),
      admin
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .neq('status', 'CANCELLED'),
    ]);
  const messages = messagesResult.data ?? [];
  const objections = Array.isArray(memoryResult.data?.objections)
    ? memoryResult.data.objections.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    lead: {
      id: lead.id,
      name: lead.name,
      city: lead.city,
      category: lead.category,
      businessStatus: lead.business_status,
      score: lead.discovery_score,
    },
    opportunity: analysisResult.data ? record(analysisResult.data) : null,
    demo: demoResult.data
      ? {
          id: demoResult.data.id,
          publicPath: demoResult.data.public_url,
          status: demoResult.data.status,
        }
      : null,
    conversation: {
      threadId: thread?.id ?? null,
      state: thread?.commercial_state ?? null,
      priority: thread?.priority ?? null,
      need: memoryResult.data?.main_need ?? null,
      objections,
      nextStep: memoryResult.data?.next_step ?? null,
    },
    engagement: {
      outboundMessages: messages.filter((message) => message.direction === 'OUTBOUND').length,
      inboundMessages: messages.filter((message) => message.direction === 'INBOUND').length,
      appointments: appointmentsResult.count ?? 0,
    },
  };
}
