import { z } from 'zod';
import type { OperatorEnvelope } from './envelope';
import { classifyOperatorIntent, type OperatorIntent } from './intent';
import type { DailyCommercialBriefing } from '@/lib/sales/daily-briefing';

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
  'get_daily_briefing',
  'get_commercial_insights',
  'list_conversations',
  'get_conversation',
  'get_telegram_inbound_status',
  'list_templates',
  'list_demos',
  'inspect_demo',
  'inspect_template',
  'list_calendar_events',
  'list_available_slots',
  'get_calendar_summary',
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
  'personalize_demo',
  'apply_demo_personalization',
  'delete_lead',
  'sql_query',
  'fetch_url',
] as const;

export const DENIED_TOOL_NAMES = ['sql_query', 'fetch_url', 'send_email', 'send_telegram', 'delete_lead'] as const;

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

export type CommercialInsights = {
  windowDays: number;
  generatedAt: string;
  metrics: Record<string, number>;
  recommendations: string[];
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

export type TemplateSummary = {
  id: string;
  name: string;
  key: string;
  status: string;
  demoCount: number;
};

export type DemoSummary = {
  id: string;
  slug: string;
  publicPath: string;
  leadName: string;
  leadId?: string | null;
  templateName: string;
  headline?: string | null;
  subheadline?: string | null;
  cta?: string | null;
};

export type TelegramInboundStatus = {
  enabled: boolean;
  replyEnabled: boolean;
  mode: string;
  summary: string;
};

export type ConversationHit = {
  threadId: string;
  leadName: string;
  channelLabel: string;
  preview: string | null;
  status: string;
  assignedMode?: string | null;
  messages?: Array<{ direction: string; body: string; at: string }>;
};

export type CalendarEventHit = {
  id: string;
  title: string;
  eventType: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  leadId: string | null;
  leadName: string | null;
  threadId: string | null;
  label: string;
};

export type CalendarSlotHit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  label: string;
};

export type CalendarSummary = {
  scheduledAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  upcomingThisWeek: number;
  availableSlots: number;
  nextAppointments: CalendarEventHit[];
  periodLabel: string;
};

export type OperatorDataSource = {
  getDashboardSummary(): Promise<Record<string, number>>;
  searchLeads(input: { city?: string; query?: string; category?: string; limit?: number }): Promise<LeadSearchHit[]>;
  getLeadDetail(leadId: string): Promise<LeadSearchHit | null>;
  listCampaigns(): Promise<CampaignSummary[]>;
  getCampaignDetail(campaignId: string): Promise<CampaignDetail | null>;
  getCampaignStats(campaignId: string): Promise<Record<string, number> | null>;
  getBlockers(campaignId?: string | null): Promise<BlockerItem[]>;
  listReviewItems(): Promise<ReviewItem[]>;
  getDailyReport(daysAgo?: number): Promise<DailyReport>;
  getDailyBriefing(): Promise<DailyCommercialBriefing>;
  getCommercialInsights(windowDays?: number): Promise<CommercialInsights>;
  listConversations(): Promise<ConversationHit[]>;
  getConversation(threadId: string): Promise<ConversationHit | null>;
  getTelegramInboundStatus(): Promise<TelegramInboundStatus>;
  listTemplates(): Promise<TemplateSummary[]>;
  listDemos(): Promise<DemoSummary[]>;
  inspectDemo(demoId: string): Promise<DemoSummary | null>;
  inspectTemplate(templateId: string): Promise<TemplateSummary | null>;
  listCalendarEvents(input?: {
    fromIso?: string;
    toIso?: string;
    leadId?: string;
    status?: string;
    limit?: number;
  }): Promise<CalendarEventHit[]>;
  listAvailableSlots(input?: { fromIso?: string; limit?: number }): Promise<CalendarSlotHit[]>;
  getCalendarSummary(input?: { daysAhead?: number }): Promise<CalendarSummary>;
};

export function plannedFromOrchestratorCall(
  call: import('./orchestrator-schema').OperatorToolCallPlan,
): PlannedToolCall {
  const args: Record<string, unknown> = {};
  if (call.city) args.city = call.city;
  if (call.query) args.query = call.query;
  if (call.category) args.category = call.category;
  if (call.campaignId) args.campaignId = call.campaignId;
  if (call.leadId) args.leadId = call.leadId;
  if (call.demoId) args.demoId = call.demoId;
  if (call.templateId) args.templateId = call.templateId;
  if (call.threadId) args.threadId = call.threadId;
  if (call.limit != null) {
    if (call.name === 'get_daily_report') args.daysAgo = call.limit;
    else args.limit = call.limit;
  }
  return { name: call.name, args };
}

export type PlannedToolCall = {
  name: OperatorToolName;
  args: Record<string, unknown>;
};

const optionalId = z.object({ id: z.string().uuid().optional() }).strict();
const searchLeadsInput = z
  .object({
    city: z.string().max(80).optional(),
    query: z.string().max(120).optional(),
    category: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
const campaignIdInput = z.object({ campaignId: z.string().uuid().optional() }).strict();
const leadIdInput = z.object({ leadId: z.string().uuid().optional() }).strict();
const threadIdInput = z.object({ threadId: z.string().uuid().optional() }).strict();
const dailyInput = z.object({ daysAgo: z.number().int().min(0).max(14).optional() }).strict();
const insightsInput = z.object({ windowDays: z.number().int().min(7).max(90).optional() }).strict();
const demoIdInput = z.object({ demoId: z.string().uuid().optional() }).strict();
const templateIdInput = z.object({ templateId: z.string().uuid().optional() }).strict();
const calendarEventsInput = z
  .object({
    fromIso: z.string().max(40).optional(),
    toIso: z.string().max(40).optional(),
    leadId: z.string().uuid().optional(),
    status: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const calendarSlotsInput = z
  .object({
    fromIso: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(40).optional(),
  })
  .strict();
const calendarSummaryInput = z
  .object({
    daysAhead: z.number().int().min(1).max(60).optional(),
  })
  .strict();

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
  get_daily_briefing: optionalId,
  get_commercial_insights: insightsInput,
  list_conversations: optionalId,
  get_conversation: threadIdInput,
  get_telegram_inbound_status: optionalId,
  list_templates: optionalId,
  list_demos: optionalId,
  inspect_demo: demoIdInput,
  inspect_template: templateIdInput,
  list_calendar_events: calendarEventsInput,
  list_available_slots: calendarSlotsInput,
  get_calendar_summary: calendarSummaryInput,
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
  get_daily_briefing: {
    start: 'Sto confrontando agenda, email e Telegram…',
    done: 'Briefing commerciale pronto',
  },
  get_commercial_insights: {
    start: 'Sto imparando dagli eventi commerciali…',
    done: 'Consigli commerciali aggiornati',
  },
  list_conversations: { start: 'Sto leggendo i messaggi…', done: 'Conversazioni caricate' },
  get_conversation: { start: 'Sto leggendo la conversazione…', done: 'Conversazione caricata' },
  get_telegram_inbound_status: { start: 'Sto leggendo lo stato Telegram…', done: 'Stato Telegram caricato' },
  list_templates: { start: 'Sto leggendo i template…', done: 'Template caricati' },
  list_demos: { start: 'Sto leggendo le demo…', done: 'Demo caricate' },
  inspect_demo: { start: 'Sto ispezionando la demo…', done: 'Demo ispezionata' },
  inspect_template: { start: 'Sto ispezionando il template…', done: 'Template ispezionato' },
  list_calendar_events: { start: 'Sto leggendo il calendario…', done: 'Eventi calendario caricati' },
  list_available_slots: { start: 'Sto leggendo le disponibilità…', done: 'Slot caricati' },
  get_calendar_summary: { start: 'Sto contando gli appuntamenti…', done: 'Riepilogo calendario pronto' },
};

export function isOperatorToolName(name: string): name is OperatorToolName {
  return (OPERATOR_TOOL_NAMES as readonly string[]).includes(name);
}

export function isDeniedToolName(name: string): boolean {
  return (DENIED_TOOL_NAMES as readonly string[]).includes(name);
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
  if (isDeniedToolName(name) || !isOperatorToolName(name)) {
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
          category: typeof args.category === 'string' ? args.category : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 8,
        }),
      };
    case 'get_lead_detail':
      if (typeof args.leadId !== 'string') {
        return { ok: true, name, result: { missing: true, reason: 'Nessuna attività nel contesto' } };
      }
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
    case 'get_daily_briefing':
      return { ok: true, name, result: await data.getDailyBriefing() };
    case 'get_commercial_insights':
      return {
        ok: true,
        name,
        result: await data.getCommercialInsights(
          typeof args.windowDays === 'number' ? args.windowDays : 30,
        ),
      };
    case 'list_conversations':
      return { ok: true, name, result: await data.listConversations() };
    case 'get_conversation':
      if (typeof args.threadId !== 'string') {
        return { ok: true, name, result: { missing: true, reason: 'Nessuna conversazione nel contesto' } };
      }
      return { ok: true, name, result: await data.getConversation(String(args.threadId)) };
    case 'get_telegram_inbound_status':
      return { ok: true, name, result: await data.getTelegramInboundStatus() };
    case 'list_templates':
      return { ok: true, name, result: await data.listTemplates() };
    case 'list_demos':
      return { ok: true, name, result: await data.listDemos() };
    case 'inspect_demo': {
      const demoId =
        typeof args.demoId === 'string'
          ? args.demoId
          : envelope.entityType === 'none'
            ? null
            : null;
      if (!demoId) return { ok: true, name, result: { missing: true, reason: 'Nessuna demo nel contesto' } };
      return { ok: true, name, result: await data.inspectDemo(demoId) };
    }
    case 'inspect_template': {
      const templateId = typeof args.templateId === 'string' ? args.templateId : null;
      if (!templateId) {
        return { ok: true, name, result: { missing: true, reason: 'Nessun template nel contesto' } };
      }
      return { ok: true, name, result: await data.inspectTemplate(templateId) };
    }
    case 'list_calendar_events':
      return {
        ok: true,
        name,
        result: await data.listCalendarEvents({
          fromIso: typeof args.fromIso === 'string' ? args.fromIso : undefined,
          toIso: typeof args.toIso === 'string' ? args.toIso : undefined,
          leadId:
            typeof args.leadId === 'string'
              ? args.leadId
              : envelope.entityType === 'lead'
                ? envelope.entityId ?? undefined
                : undefined,
          status: typeof args.status === 'string' ? args.status : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 20,
        }),
      };
    case 'list_available_slots':
      return {
        ok: true,
        name,
        result: await data.listAvailableSlots({
          fromIso: typeof args.fromIso === 'string' ? args.fromIso : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 10,
        }),
      };
    case 'get_calendar_summary':
      return {
        ok: true,
        name,
        result: await data.getCalendarSummary({
          daysAhead: typeof args.daysAhead === 'number' ? args.daysAhead : 14,
        }),
      };
  }
}

function campaignCalls(envelope: OperatorEnvelope, withStats = true): PlannedToolCall[] {
  const campaignId = envelope.entityType === 'campaign' ? envelope.entityId : undefined;
  if (!campaignId) return [{ name: 'list_campaigns', args: {} }];
  const calls: PlannedToolCall[] = [{ name: 'get_campaign_detail', args: { campaignId } }];
  if (withStats) calls.push({ name: 'get_campaign_stats', args: { campaignId } });
  return calls;
}

export function suggestOperatorTools(
  question: string,
  envelope: OperatorEnvelope,
  intent: OperatorIntent = classifyOperatorIntent(question),
): PlannedToolCall[] {
  const q = question.toLowerCase();
  const calls: PlannedToolCall[] = [];
  const has = (name: OperatorToolName) => calls.some((c) => c.name === name);

  if (intent.kind === 'HELP' || intent.kind === 'UNKNOWN') return [];

  if (intent.kind === 'DESTRUCTIVE') {
    return campaignCalls(envelope);
  }

  if (intent.kind === 'POLICY') return [];

  if (intent.kind === 'EXTERNAL') {
    return envelope.entityType === 'campaign' && envelope.entityId
      ? campaignCalls(envelope)
      : [{ name: 'list_campaigns', args: {} }];
  }

  if (intent.kind === 'PREPARE') {
    if (intent.writeVerb === 'pause' || intent.writeVerb === 'resume') {
      return campaignCalls(envelope, false);
    }
    if (/analizz/.test(q) && envelope.entityType === 'lead' && envelope.entityId) {
      calls.push({ name: 'get_lead_detail', args: { leadId: envelope.entityId } });
      return calls;
    }
    if (/lead|ristorant|milano|roma|napoli|torino|firenze|bologna|miglior/.test(q)) {
      const cityMatch = question.match(/\b(milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona)\b/i);
      const limitMatch = q.match(/\b(\d{1,2})\b/);
      calls.push({
        name: 'search_leads',
        args: {
          city: cityMatch?.[1] ?? envelope.filters?.city,
          category: /ristorant|restaurant/.test(q) ? 'restaurant' : undefined,
          limit: limitMatch ? Math.min(20, Number(limitMatch[1])) : 20,
        },
      });
    }
    if (/campagna/.test(q) && envelope.entityType === 'campaign' && envelope.entityId) {
      calls.push({ name: 'get_campaign_detail', args: { campaignId: envelope.entityId } });
      calls.push({ name: 'get_campaign_stats', args: { campaignId: envelope.entityId } });
    }
    return calls;
  }

  if (/ieri|oggi|andata|report|numeri|briefing|brief/.test(q)) {
    calls.push({ name: 'get_daily_report', args: { daysAgo: /oggi/.test(q) && !/ieri/.test(q) ? 0 : 1 } });
  }
  if (/lead|attivit|miglior|milano|roma|firenze|napoli|torino|bologna|città|citta|ristorant/.test(q)) {
    const cityMatch = question.match(/\b(milano|roma|napoli|torino|firenze|bologna|bergamo|brescia|genova|padova|verona)\b/i);
    const limitMatch = q.match(/\b(\d{1,2})\b/);
    calls.push({
      name: 'search_leads',
      args: {
        city: cityMatch?.[1] ?? envelope.filters?.city,
        query: envelope.filters?.query,
        category: /ristorant|restaurant/.test(q) ? 'restaurant' : undefined,
        limit: limitMatch ? Math.min(20, Number(limitMatch[1])) : 8,
      },
    });
  }
  if (/aprila|apri questa|apri la campagna|stato della campagna|dettagli campagna/.test(q)) {
    for (const call of campaignCalls(envelope)) {
      if (!has(call.name)) calls.push(call);
    }
  }
  if (/blocc|perch|blocker/.test(q)) {
    const campaignId = envelope.entityType === 'campaign' ? envelope.entityId : undefined;
    if (campaignId) {
      if (!has('get_campaign_detail')) {
        calls.push({ name: 'get_campaign_detail', args: { campaignId } });
        calls.push({ name: 'get_campaign_stats', args: { campaignId } });
      }
    } else if (!has('list_campaigns')) {
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
  if (/consigl|impar|miglior|conversion|strateg|proattiv/.test(q)) {
    calls.push({ name: 'get_daily_briefing', args: {} });
    if (/impar|miglior|conversion|strateg/.test(q)) {
      calls.push({ name: 'get_commercial_insights', args: { windowDays: 30 } });
    }
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
