import { z } from 'zod';
import type { OperatorEnvelope } from './envelope';

export const OPERATOR_TOOL_NAMES = [
  'get_dashboard_summary',
  'search_leads',
  'get_lead_detail',
  'list_campaigns',
  'get_campaign_detail',
  'get_campaign_stats',
  'get_blockers',
  'list_review_items',
  'get_daily_report',
  'list_conversations',
  'get_conversation',
] as const;

export type OperatorToolName = (typeof OPERATOR_TOOL_NAMES)[number];

export const WRITE_TOOL_NAMES = [
  'create_campaign',
  'prepare_campaign',
  'send_email',
  'send_telegram',
  'approve_review',
  'pause_campaign',
  'resume_campaign',
  'update_draft',
  'delete_lead',
  'sql_query',
  'fetch_url',
] as const;

export type CountMetric =
  | { available: true; value: number }
  | { available: false; reason: string };

export type DailyReport = {
  period: { label: string; startIso: string; endIso: string; timezone: 'Europe/Rome' };
  metrics: {
    leadsFound: CountMetric;
    qualified: CountMetric;
    demosReady: CountMetric;
    reviewEntered: CountMetric;
    failedPreparations: CountMetric;
    emailsSent: CountMetric;
    replies: CountMetric;
  };
  failedSamples: Array<{ id: string; name: string; reason: string }>;
};

export type LeadSearchHit = {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  discoveryScore: number | null;
  qualificationStatus: string;
  websiteUrl: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  mode: string;
  deliveryMode: string | null;
  createdAt: string;
};

export type CampaignDetail = CampaignSummary & {
  totals: Record<string, number>;
};

export type BlockerItem = {
  kind: string;
  label: string;
  entityId: string | null;
  entityName: string | null;
};

export type ReviewItem = {
  id: string;
  campaignId: string;
  companyName: string;
  city: string;
  status: string;
  blockers: string[];
};

export type ConversationHit = {
  threadId: string;
  leadName: string;
  channelLabel: string;
  preview: string | null;
  status: string;
};

export type OperatorDataSource = {
  getDashboardSummary(): Promise<Record<string, number>>;
  searchLeads(input: { city?: string; query?: string; limit?: number }): Promise<LeadSearchHit[]>;
  getLeadDetail(leadId: string): Promise<LeadSearchHit | null>;
  listCampaigns(): Promise<CampaignSummary[]>;
  getCampaignDetail(campaignId: string): Promise<CampaignDetail | null>;
  getCampaignStats(campaignId: string): Promise<Record<string, number> | null>;
  getBlockers(campaignId?: string | null): Promise<BlockerItem[]>;
  listReviewItems(): Promise<ReviewItem[]>;
  getDailyReport(daysAgo?: number): Promise<DailyReport>;
  listConversations(): Promise<ConversationHit[]>;
  getConversation(threadId: string): Promise<ConversationHit | null>;
};

export type PlannedToolCall = {
  name: OperatorToolName;
  args: Record<string, unknown>;
};

const optionalId = z.object({ id: z.string().uuid().optional() }).strict();
const searchLeadsInput = z
  .object({
    city: z.string().max(80).optional(),
    query: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
const campaignIdInput = z.object({ campaignId: z.string().uuid().optional() }).strict();
const leadIdInput = z.object({ leadId: z.string().uuid() }).strict();
const threadIdInput = z.object({ threadId: z.string().uuid() }).strict();
const dailyInput = z.object({ daysAgo: z.number().int().min(0).max(14).optional() }).strict();

export const TOOL_INPUT_SCHEMAS: Record<OperatorToolName, z.ZodType> = {
  get_dashboard_summary: optionalId,
  search_leads: searchLeadsInput,
  get_lead_detail: leadIdInput,
  list_campaigns: optionalId,
  get_campaign_detail: campaignIdInput,
  get_campaign_stats: campaignIdInput,
  get_blockers: campaignIdInput,
  list_review_items: optionalId,
  get_daily_report: dailyInput,
  list_conversations: optionalId,
  get_conversation: threadIdInput,
};

export const TOOL_LABELS: Record<OperatorToolName, { start: string; done: string }> = {
  get_dashboard_summary: {
    start: 'Sto leggendo il riepilogo…',
    done: 'Riepilogo caricato',
  },
  search_leads: { start: 'Sto cercando le attività…', done: 'Attività caricate' },
  get_lead_detail: { start: 'Sto leggendo l’attività…', done: 'Attività caricata' },
  list_campaigns: { start: 'Sto leggendo le campagne…', done: 'Campagne caricate' },
  get_campaign_detail: { start: 'Sto leggendo la campagna…', done: 'Campagna caricata' },
  get_campaign_stats: { start: 'Sto leggendo i numeri della campagna…', done: 'Numeri campagna caricati' },
  get_blockers: { start: 'Sto verificando i blocker…', done: 'Blocker verificati' },
  list_review_items: { start: 'Sto leggendo la Review…', done: 'Review caricata' },
  get_daily_report: { start: 'Sto leggendo i numeri del periodo…', done: 'Report giornaliero caricato' },
  list_conversations: { start: 'Sto leggendo i messaggi…', done: 'Conversazioni caricate' },
  get_conversation: { start: 'Sto leggendo la conversazione…', done: 'Conversazione caricata' },
};

export function isOperatorToolName(name: string): name is OperatorToolName {
  return (OPERATOR_TOOL_NAMES as readonly string[]).includes(name);
}

export function isWriteToolName(name: string): boolean {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function parseToolArgs(
  name: OperatorToolName,
  raw: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = TOOL_INPUT_SCHEMAS[name].safeParse(raw ?? {});
  if (!parsed.success) {
    return { ok: false, error: 'argomenti tool non validi' };
  }
  return { ok: true, args: parsed.data as Record<string, unknown> };
}

export async function executeOperatorTool(
  name: string,
  rawArgs: unknown,
  data: OperatorDataSource,
  envelope: OperatorEnvelope,
): Promise<{ ok: false; denied: true; error: string } | { ok: true; name: OperatorToolName; result: unknown }> {
  if (isWriteToolName(name) || !isOperatorToolName(name)) {
    return { ok: false, denied: true, error: 'tool non registrato' };
  }
  const parsed = parseToolArgs(name, rawArgs);
  if (!parsed.ok) {
    return { ok: false, denied: true, error: parsed.error };
  }
  const args = parsed.args;
  const campaignId =
    (typeof args.campaignId === 'string' ? args.campaignId : null) ??
    (envelope.entityType === 'campaign' ? envelope.entityId : null);

  switch (name) {
    case 'get_dashboard_summary':
      return { ok: true, name, result: await data.getDashboardSummary() };
    case 'search_leads':
      return {
        ok: true,
        name,
        result: await data.searchLeads({
          city: typeof args.city === 'string' ? args.city : envelope.filters?.city,
          query: typeof args.query === 'string' ? args.query : envelope.filters?.query,
          limit: typeof args.limit === 'number' ? args.limit : 8,
        }),
      };
    case 'get_lead_detail':
      return { ok: true, name, result: await data.getLeadDetail(String(args.leadId)) };
    case 'list_campaigns':
      return { ok: true, name, result: await data.listCampaigns() };
    case 'get_campaign_detail':
      if (!campaignId) return { ok: true, name, result: { missing: true, reason: 'Nessuna campagna nel contesto' } };
      return { ok: true, name, result: await data.getCampaignDetail(campaignId) };
    case 'get_campaign_stats':
      if (!campaignId) return { ok: true, name, result: { missing: true, reason: 'Nessuna campagna nel contesto' } };
      return { ok: true, name, result: await data.getCampaignStats(campaignId) };
    case 'get_blockers':
      return { ok: true, name, result: await data.getBlockers(campaignId) };
    case 'list_review_items':
      return { ok: true, name, result: await data.listReviewItems() };
    case 'get_daily_report':
      return {
        ok: true,
        name,
        result: await data.getDailyReport(typeof args.daysAgo === 'number' ? args.daysAgo : 1),
      };
    case 'list_conversations':
      return { ok: true, name, result: await data.listConversations() };
    case 'get_conversation':
      return { ok: true, name, result: await data.getConversation(String(args.threadId)) };
  }
}

export function suggestOperatorTools(question: string, envelope: OperatorEnvelope): PlannedToolCall[] {
  const q = question.toLowerCase();
  const calls: PlannedToolCall[] = [];
  const has = (name: OperatorToolName) => calls.some((c) => c.name === name);

  if (/ieri|oggi|andata|report|numeri/.test(q)) {
    calls.push({ name: 'get_daily_report', args: { daysAgo: /oggi/.test(q) && !/ieri/.test(q) ? 0 : 1 } });
  }
  if (/lead|attivit|miglior|milano|roma|firenze|napoli|torino|bologna|città|citta/.test(q)) {
    const cityMatch = question.match(/\b(milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona)\b/i);
    calls.push({
      name: 'search_leads',
      args: {
        city: cityMatch?.[1] ?? envelope.filters?.city,
        query: envelope.filters?.query,
        limit: 8,
      },
    });
  }
  if (/blocc|perch|blocker|ferma|pausa/.test(q)) {
    const campaignId = envelope.entityType === 'campaign' ? envelope.entityId : undefined;
    if (campaignId) {
      calls.push({ name: 'get_campaign_detail', args: { campaignId } });
      calls.push({ name: 'get_campaign_stats', args: { campaignId } });
    } else {
      calls.push({ name: 'list_campaigns', args: {} });
    }
    calls.push({ name: 'get_blockers', args: campaignId ? { campaignId } : {} });
  }
  if (/review|da controllare/.test(q)) {
    calls.push({ name: 'list_review_items', args: {} });
  }
  if (/messagg|inbox|conversaz|telegram/.test(q)) {
    calls.push({ name: 'list_conversations', args: {} });
  }
  if (/riepilogo|dashboard|quanto/.test(q) && !has('get_daily_report')) {
    calls.push({ name: 'get_dashboard_summary', args: {} });
  }
  if (calls.length === 0) {
    calls.push({ name: 'get_dashboard_summary', args: {} });
  }
  return calls;
}

export function operatorTaskType(
  question: string,
): 'answer_operator' | 'answer_operator_simple' {
  if (/perch|blocc|blocker|analizz|confront/.test(question.toLowerCase())) {
    return 'answer_operator';
  }
  return 'answer_operator_simple';
}
