import { getDashboardStats } from '@/lib/dashboard/stats';
import { getInboxConversation } from '@/lib/inbound/conversation';
import { listInboxThreads } from '@/lib/inbound/list-inbox';
import { listReviewQueue } from '@/lib/campaigns/review-queue';
import { getOutreachPausedAll } from '@/lib/settings/outreach-pause';
import { resolveAppUrl } from '@/lib/app-url';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { europeRomeDayRange, formatEuropeRome } from './time';
import { listDemos, loadDemoById } from '@/lib/demos/load';
import { getTelegramInboundSettings } from '@/lib/inbound/telegram-settings';
import { listAvailableSlots, listCalendarEvents } from '@/lib/calendar';
import { getCommercialLearningSnapshot } from '@/lib/sales/learning';
import { getDailyCommercialBriefing } from '@/lib/sales/daily-briefing';
import { getActiveCommercialGoal, getActiveGoalPlan } from '@/lib/sales/goals/store';
import { discoveryCategoryLabel } from '@/lib/leads/discovery-categories';
import { lookupSecurityReport } from '@/lib/security/operator-lookup';
import type {
  BlockerItem,
  CalendarEventHit,
  CalendarSlotHit,
  CalendarSummary,
  CommercialInsights,
  CampaignDetail,
  CampaignSummary,
  ConversationHit,
  CountMetric,
  DailyReport,
  DemoSummary,
  LeadSearchHit,
  OperatorDataSource,
  SecurityOperatorReport,
  ReviewItem,
  TelegramInboundStatus,
  TemplateSummary,
} from './registry';

const BLOCKER_LABELS: Record<string, string> = {
  EMAIL_NOT_FOUND: 'Manca l’email',
  TEST_RECIPIENT_MISSING: 'Manca il destinatario di prova',
  TEST_RECIPIENT_NOT_ALLOWED: 'Destinatario di prova non autorizzato',
  DEMO_NOT_READY: 'Anteprima non pronta',
  PREPARATION_FAILED: 'Preparazione ferma',
  TEMPLATE_NOT_COMPATIBLE: 'Modello non compatibile',
  OUTREACH_PAUSED: 'Invii in pausa',
};

function labelBlocker(code: string): string {
  return BLOCKER_LABELS[code] ?? code;
}

async function counted(
  run: () => Promise<{ count: number | null; error: { message: string } | null }>,
  reason: string,
): Promise<CountMetric> {
  try {
    const { count, error } = await run();
    if (error) return { available: false, reason };
    return { available: true, value: count ?? 0 };
  } catch {
    return { available: false, reason };
  }
}

export function createSupabaseOperatorData(
  admin: AppSupabaseClient,
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
): OperatorDataSource {
  return {
    async getDashboardSummary() {
      return { ...(await getDashboardStats(admin, workspaceId)) };
    },

    async searchLeads(input) {
      let query = admin
        .from('leads')
        .select('id, name, city, category, discovery_score, qualification_status, website_url')
        .eq('workspace_id', workspaceId)
        .order('discovery_score', { ascending: false, nullsFirst: false })
        .limit(input.limit ?? 8);
      if (input.city?.trim()) {
        query = query.ilike('city', `%${input.city.trim().replace(/[%_]/g, '')}%`);
      }
      if (input.category?.trim()) {
        const rawCategory = input.category.trim().replace(/[%_,().]/g, '');
        const localizedCategory = discoveryCategoryLabel(rawCategory).replace(/[%_,().]/g, '');
        const variants = [...new Set([rawCategory, localizedCategory].filter(Boolean))];
        query = query.or(variants.map((value) => `category.ilike.%${value}%`).join(','));
      }
      if (input.query?.trim()) {
        query = query.ilike('name', `%${input.query.trim().replace(/[%_]/g, '')}%`);
      }
      const { data, error } = await query;
      if (error) throw new Error(`search_leads: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        category: row.category,
        discoveryScore: row.discovery_score,
        qualificationStatus: row.qualification_status,
        websiteUrl: row.website_url,
      }));
    },

    async getSecurityReport(input) {
      return lookupSecurityReport(admin, workspaceId, input);
    },

    async getLeadDetail(leadId) {
      const { data, error } = await admin
        .from('leads')
        .select('id, name, city, category, discovery_score, qualification_status, website_url')
        .eq('workspace_id', workspaceId)
        .eq('id', leadId)
        .maybeSingle();
      if (error) throw new Error(`get_lead_detail: ${error.message}`);
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        city: data.city,
        category: data.category,
        discoveryScore: data.discovery_score,
        qualificationStatus: data.qualification_status,
        websiteUrl: data.website_url,
      };
    },

    async listCampaigns() {
      const { data, error } = await admin
        .from('campaigns')
        .select('id, name, status, mode, delivery_mode, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(`list_campaigns: ${error.message}`);
      return (data ?? []).map(
        (row): CampaignSummary => ({
          id: row.id,
          name: row.name,
          status: row.status,
          mode: row.mode,
          deliveryMode: row.delivery_mode,
          createdAt: row.created_at,
        }),
      );
    },

    async getCampaignDetail(campaignId) {
      const { data: campaign, error } = await admin
        .from('campaigns')
        .select('id, name, status, mode, delivery_mode, created_at')
        .eq('workspace_id', workspaceId)
        .eq('id', campaignId)
        .maybeSingle();
      if (error) throw new Error(`get_campaign_detail: ${error.message}`);
      if (!campaign) return null;
      const stats = await this.getCampaignStats(campaignId);
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        mode: campaign.mode,
        deliveryMode: campaign.delivery_mode,
        createdAt: campaign.created_at,
        totals: stats ?? {},
      };
    },

    async getCampaignStats(campaignId) {
      const { data, error } = await admin
        .from('campaign_leads')
        .select('status')
        .eq('workspace_id', workspaceId)
        .eq('campaign_id', campaignId);
      if (error) throw new Error(`get_campaign_stats: ${error.message}`);
      const totals: Record<string, number> = { leads: data?.length ?? 0 };
      for (const row of data ?? []) {
        const key = (row.status ?? 'UNKNOWN').toLowerCase();
        totals[key] = (totals[key] ?? 0) + 1;
      }
      return totals;
    },

    async getBlockers(campaignId) {
      const items: BlockerItem[] = [];
      const paused = await getOutreachPausedAll(admin, workspaceId);
      if (paused) {
        items.push({
          kind: 'OUTREACH_PAUSED',
          label: 'Tutti gli invii sono in pausa dal pulsante in alto',
          entityId: null,
          entityName: null,
        });
      }

      let campaignQuery = admin
        .from('campaigns')
        .select('id, name, status')
        .eq('workspace_id', workspaceId);
      if (campaignId) campaignQuery = campaignQuery.eq('id', campaignId);
      const { data: campaigns } = await campaignQuery.limit(20);
      for (const campaign of campaigns ?? []) {
        if (campaign.status === 'PAUSED') {
          items.push({
            kind: 'CAMPAIGN_PAUSED',
            label: `La campagna «${campaign.name}» è in pausa`,
            entityId: campaign.id,
            entityName: campaign.name,
          });
        }
      }

      let failedQuery = admin
        .from('campaign_leads')
        .select('id, campaign_id, status, lead_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'FAILED');
      if (campaignId) failedQuery = failedQuery.eq('campaign_id', campaignId);
      const { data: failed } = await failedQuery.limit(10);
      const failedLeadIds = [...new Set((failed ?? []).map((row) => row.lead_id))];
      const { data: failedLeads } = failedLeadIds.length
        ? await admin.from('leads').select('id, name').in('id', failedLeadIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const failedName = new Map((failedLeads ?? []).map((row) => [row.id, row.name]));
      for (const row of failed ?? []) {
        items.push({
          kind: 'PREPARATION_FAILED',
          label: `Preparazione ferma per ${failedName.get(row.lead_id) ?? 'un’attività'}`,
          entityId: campaignId ?? row.campaign_id,
          entityName: failedName.get(row.lead_id) ?? null,
        });
      }

      let jobsQuery = admin
        .from('automation_jobs')
        .select('id, job_type, status, error_detail, entity_id')
        .eq('workspace_id', workspaceId)
        .in('status', ['FAILED', 'RETRYING']);
      if (campaignId) jobsQuery = jobsQuery.eq('entity_id', campaignId);
      const { data: jobs } = await jobsQuery.limit(10);
      for (const job of jobs ?? []) {
        items.push({
          kind: job.status === 'RETRYING' ? 'JOB_RETRYING' : 'JOB_FAILED',
          label: job.error_detail
            ? `${job.job_type}: ${job.error_detail}`
            : `Lavoro ${job.job_type} ${job.status === 'RETRYING' ? 'in attesa di riprova' : 'fallito'}`,
          entityId: job.id,
          entityName: job.job_type,
        });
      }

      return items;
    },

    async listReviewItems() {
      const items = await listReviewQueue(admin, workspaceId, resolveAppUrl(env));
      return items.map(
        (item): ReviewItem => ({
          id: item.id,
          campaignId: item.campaignId,
          companyName: item.companyName,
          city: item.city,
          status: item.status,
          blockers: item.blockers.map(labelBlocker),
        }),
      );
    },

    async getDailyReport(daysAgo = 1) {
      const period = europeRomeDayRange(daysAgo);
      const range = { start: period.startIso, end: period.endIso };
      const inRange = (column: string) =>
        admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .gte(column, range.start)
          .lt(column, range.end);

      const [leadsFound, qualified, demosReady, reviewEntered, failedPreparations, emailsSent, replies] =
        await Promise.all([
          counted(
            async () => inRange('created_at'),
            'conteggio nuovi lead non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .eq('qualification_status', 'PREQUALIFIED')
                .gte('qualified_at', range.start)
                .lt('qualified_at', range.end),
            'conteggio qualificati non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('demo_sites')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .gte('created_at', range.start)
                .lt('created_at', range.end),
            'conteggio anteprime non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('campaign_leads')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .eq('status', 'REVIEW')
                .gte('updated_at', range.start)
                .lt('updated_at', range.end),
            'conteggio Review non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('campaign_leads')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .eq('status', 'FAILED')
                .gte('updated_at', range.start)
                .lt('updated_at', range.end),
            'conteggio preparazioni ferme non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .eq('direction', 'OUTBOUND')
                .gte('sent_at', range.start)
                .lt('sent_at', range.end),
            'conteggio email inviate non disponibile',
          ),
          counted(
            async () =>
              admin
                .from('message_events')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .eq('event_type', 'REPLIED')
                .gte('occurred_at', range.start)
                .lt('occurred_at', range.end),
            'conteggio risposte non disponibile',
          ),
        ]);

      const { data: failedRows } = await admin
        .from('campaign_leads')
        .select('id, lead_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'FAILED')
        .gte('updated_at', range.start)
        .lt('updated_at', range.end)
        .limit(5);
      const sampleLeadIds = [...new Set((failedRows ?? []).map((row) => row.lead_id))];
      const { data: sampleLeads } = sampleLeadIds.length
        ? await admin.from('leads').select('id, name').in('id', sampleLeadIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const sampleName = new Map((sampleLeads ?? []).map((row) => [row.id, row.name]));

      const report: DailyReport = {
        period: {
          label: period.label,
          startIso: period.startIso,
          endIso: period.endIso,
          timezone: 'Europe/Rome',
        },
        metrics: {
          leadsFound,
          qualified,
          demosReady,
          reviewEntered,
          failedPreparations,
          emailsSent,
          replies,
        },
        failedSamples: (failedRows ?? []).map((row) => ({
          id: row.id,
          name: sampleName.get(row.lead_id) ?? 'Attività',
          reason: 'Preparazione ferma',
        })),
      };
      return report;
    },

    async getDailyBriefing() {
      return getDailyCommercialBriefing(admin, workspaceId);
    },

    async getActiveCommercialGoal() {
      return getActiveCommercialGoal(admin, workspaceId);
    },

    async getCommercialGoalPlan(goalId) {
      const goal = goalId
        ? { id: goalId }
        : await getActiveCommercialGoal(admin, workspaceId);
      return goal ? getActiveGoalPlan(admin, goal.id) : null;
    },

    async getCommercialInsights(windowDays = 30): Promise<CommercialInsights> {
      return getCommercialLearningSnapshot(admin, workspaceId, windowDays);
    },

    async listConversations() {
      const threads = await listInboxThreads(admin, workspaceId, 15);
      return threads.map(
        (t): ConversationHit => ({
          threadId: t.threadId,
          leadName: t.leadName,
          channelLabel: t.channelLabel,
          preview: t.preview,
          status: t.status,
        }),
      );
    },

    async getConversation(threadId) {
      const detail = await getInboxConversation(admin, workspaceId, threadId);
      if (!detail) return null;
      return {
        threadId: detail.threadId,
        leadName: detail.leadName,
        channelLabel: detail.chat.isGroup ? 'Gruppo' : 'Chat',
        preview: detail.messages.at(-1)?.body?.slice(0, 160) ?? null,
        status: detail.replyStatus.state,
        assignedMode: detail.assignedMode ?? null,
        messages: detail.messages.slice(-12).map((m) => ({
          direction: m.direction,
          body: (m.body ?? '').slice(0, 400),
          at: m.sentAt,
        })),
        aiDraft: detail.aiDraft
          ? {
              understanding: detail.aiDraft.understanding.slice(0, 400),
              text: detail.aiDraft.text.slice(0, 1200),
            }
          : null,
      };
    },

    async getTelegramInboundStatus() {
      const settings = await getTelegramInboundSettings(admin, workspaceId);
      const providerMode = (env.TELEGRAM_PROVIDER_MODE ?? 'mock').toLowerCase();
      const operational =
        !settings.enabled
          ? 'Fermo'
          : settings.replyEnabled
            ? 'Automatico protetto'
            : 'Gestione manuale';
      const summary = settings.enabled
        ? `Telegram è in ${operational.toLowerCase()} (provider ${providerMode}). ${
            settings.replyEnabled
              ? 'Risponde automaticamente se i controlli passano.'
              : 'Ascolta e prepara bozze, senza inviare da solo.'
          }`
        : `Telegram è fermo. Puoi avviarlo da Impostazioni o chiedere «metti Telegram in automatico protetto».`;
      return {
        enabled: settings.enabled,
        replyEnabled: settings.replyEnabled,
        mode: operational,
        summary,
      } satisfies TelegramInboundStatus;
    },

    async listTemplates() {
      const { data: catalog } = await admin
        .from('website_templates')
        .select('id, key, name, status')
        .eq('workspace_id', workspaceId)
        .order('name')
        .limit(20);
      const { data: demos } = await admin
        .from('demo_sites')
        .select('template_id')
        .eq('workspace_id', workspaceId);
      return (catalog ?? []).map(
        (row): TemplateSummary => ({
          id: row.id,
          name: row.name ?? row.key,
          key: row.key,
          status: row.status,
          demoCount: (demos ?? []).filter((d) => d.template_id === row.id).length,
        }),
      );
    },

    async listDemos() {
      const items = await listDemos(admin, workspaceId);
      return items.slice(0, 20).map(
        (row): DemoSummary => ({
          id: row.id,
          slug: row.slug,
          publicPath: row.publicPath,
          leadName: row.leadName,
          templateName: row.templateName,
        }),
      );
    },

    async inspectDemo(demoId) {
      const demo = await loadDemoById(admin, workspaceId, demoId);
      if (!demo) return null;
      const content = demo.data && 'content' in demo.data ? demo.data.content : null;
      return {
        id: demo.id,
        slug: demo.slug,
        publicPath: demo.publicPath,
        leadName: demo.lead.name,
        leadId: demo.lead.id,
        templateName: demo.template.name,
        headline: content && 'headline' in content ? (content.headline as string | null) : null,
        subheadline:
          content && 'subheadline' in content ? ((content as { subheadline?: string | null }).subheadline ?? null) : null,
        cta: content && 'cta' in content ? (content.cta as string | null) : null,
      };
    },

    async inspectTemplate(templateId) {
      const templates = await this.listTemplates();
      return templates.find((t) => t.id === templateId) ?? null;
    },

    async listCalendarEvents(input) {
      const fromIso = input?.fromIso ?? new Date().toISOString();
      const events = await listCalendarEvents(admin, workspaceId, {
        fromIso,
        toIso: input?.toIso,
        leadId: input?.leadId,
        status: input?.status as 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | undefined,
        types: ['APPOINTMENT'],
      });
      const leadIds = [...new Set(events.map((e) => e.lead_id).filter(Boolean))] as string[];
      const leadNames = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await admin
          .from('leads')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('id', leadIds);
        for (const lead of leads ?? []) leadNames.set(lead.id, lead.name);
      }
      return events.slice(0, input?.limit ?? 20).map(
        (event): CalendarEventHit => ({
          id: event.id,
          title: event.title,
          eventType: event.event_type,
          status: event.status,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          leadId: event.lead_id,
          leadName: event.lead_id ? leadNames.get(event.lead_id) ?? null : null,
          threadId: event.thread_id,
          label: event.starts_at
            ? `${formatEuropeRome(event.starts_at)} · ${event.title}`
            : event.title,
        }),
      );
    },

    async listAvailableSlots(input) {
      const slots = await listAvailableSlots(admin, workspaceId, {
        fromIso: input?.fromIso,
        limit: input?.limit ?? 10,
      });
      return slots.map(
        (slot): CalendarSlotHit => ({
          id: slot.id,
          startsAt: slot.starts_at,
          endsAt: slot.ends_at,
          status: slot.status,
          label: formatEuropeRome(slot.starts_at),
        }),
      );
    },

    async getCalendarSummary(input) {
      const daysAhead = input?.daysAhead ?? 14;
      const now = new Date();
      const to = new Date(now.getTime() + daysAhead * 24 * 60 * 60_000);
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
      const [allScheduled, completed, cancelled, upcoming, slots] = await Promise.all([
        listCalendarEvents(admin, workspaceId, {
          types: ['APPOINTMENT'],
          status: 'SCHEDULED',
          fromIso: now.toISOString(),
        }),
        admin
          .from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('event_type', 'APPOINTMENT')
          .eq('status', 'COMPLETED'),
        admin
          .from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('event_type', 'APPOINTMENT')
          .eq('status', 'CANCELLED'),
        listCalendarEvents(admin, workspaceId, {
          types: ['APPOINTMENT'],
          status: 'SCHEDULED',
          fromIso: now.toISOString(),
          toIso: to.toISOString(),
        }),
        listAvailableSlots(admin, workspaceId, { limit: 40 }),
      ]);
      const thisWeek = allScheduled.filter(
        (e) => e.starts_at && new Date(e.starts_at).getTime() <= weekEnd.getTime(),
      );
      const leadIds = [...new Set(upcoming.slice(0, 5).map((e) => e.lead_id).filter(Boolean))] as string[];
      const leadNames = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await admin
          .from('leads')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('id', leadIds);
        for (const lead of leads ?? []) leadNames.set(lead.id, lead.name);
      }
      const nextAppointments: CalendarEventHit[] = upcoming.slice(0, 5).map((event) => ({
        id: event.id,
        title: event.title,
        eventType: event.event_type,
        status: event.status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        leadId: event.lead_id,
        leadName: event.lead_id ? leadNames.get(event.lead_id) ?? null : null,
        threadId: event.thread_id,
        label: event.starts_at
          ? `${formatEuropeRome(event.starts_at)} · ${event.title}`
          : event.title,
      }));
      return {
        scheduledAppointments: allScheduled.length,
        completedAppointments: completed.count ?? 0,
        cancelledAppointments: cancelled.count ?? 0,
        upcomingThisWeek: thisWeek.length,
        availableSlots: slots.length,
        nextAppointments,
        periodLabel: `prossimi ${daysAhead} giorni`,
      } satisfies CalendarSummary;
    },
  };
}

export function createMemoryOperatorData(seed?: {
  leads?: LeadSearchHit[];
  campaigns?: CampaignDetail[];
  blockers?: BlockerItem[];
  review?: ReviewItem[];
  securityReports?: SecurityOperatorReport[];
  daily?: DailyReport;
  conversations?: ConversationHit[];
  dashboard?: Record<string, number>;
  templates?: TemplateSummary[];
  demos?: DemoSummary[];
  telegram?: TelegramInboundStatus;
}): OperatorDataSource {
  const leads = seed?.leads ?? [];
  const campaigns = seed?.campaigns ?? [];
  return {
    async getDashboardSummary() {
      return seed?.dashboard ?? { leadsTotal: leads.length };
    },
    async searchLeads(input) {
      const city = input.city?.toLowerCase();
      const category = input.category?.toLowerCase();
      return leads
        .filter((lead) => (city ? (lead.city ?? '').toLowerCase().includes(city) : true))
        .filter((lead) =>
          category ? (lead.category ?? '').toLowerCase().includes(category) : true,
        )
        .sort((a, b) => (b.discoveryScore ?? -1) - (a.discoveryScore ?? -1))
        .slice(0, input.limit ?? 8);
    },
    async getLeadDetail(leadId) {
      return leads.find((lead) => lead.id === leadId) ?? null;
    },
    async getSecurityReport(input) {
      const reports = seed?.securityReports ?? [];
      if (input.targetId) {
        return reports.find((row) => row.targetId === input.targetId) ?? { found: false, reason: 'Report non trovato.' };
      }
      if (input.query) {
        const needle = input.query.toLowerCase();
        const match = reports.find((row) => (row.name ?? '').toLowerCase().includes(needle));
        if (match) return match;
      }
      return {
        found: false,
        reason: input.query
          ? `Non ho un report Sicurezza per «${input.query}».`
          : 'Dimmi il nome dell’attività.',
      };
    },
    async listCampaigns() {
      return campaigns;
    },
    async getCampaignDetail(campaignId) {
      return campaigns.find((c) => c.id === campaignId) ?? null;
    },
    async getCampaignStats(campaignId) {
      return campaigns.find((c) => c.id === campaignId)?.totals ?? null;
    },
    async getBlockers(campaignId) {
      const items = seed?.blockers ?? [];
      return campaignId ? items.filter((b) => !b.entityId || b.entityId === campaignId) : items;
    },
    async listReviewItems() {
      return seed?.review ?? [];
    },
    async getDailyReport() {
      if (!seed?.daily) {
        return {
          period: {
            label: 'ieri',
            startIso: '2026-08-24T22:00:00.000Z',
            endIso: '2026-08-25T22:00:00.000Z',
            timezone: 'Europe/Rome',
          },
          metrics: {
            leadsFound: { available: true, value: 46 },
            qualified: { available: true, value: 18 },
            demosReady: { available: true, value: 11 },
            reviewEntered: { available: true, value: 7 },
            failedPreparations: { available: true, value: 2 },
            emailsSent: { available: false, reason: 'conteggio email inviate non disponibile' },
            replies: { available: false, reason: 'conteggio risposte non disponibile' },
          },
          failedSamples: [
            { id: '11111111-1111-4111-8111-111111111111', name: 'Osteria Test', reason: 'Sito non raggiungibile' },
            { id: '22222222-2222-4222-8222-222222222222', name: 'Bar Demo', reason: 'Dati insufficienti' },
          ],
        };
      }
      return seed.daily;
    },
    async getDailyBriefing() {
      return {
        generatedAt: '2026-08-25T08:00:00.000Z',
        today: {
          appointments: 1,
          nextAppointment: 'Call Osteria Test, mar 25 ago, 15:00',
          hotThreads: 2,
          followUpsDue: 1,
        },
        channels: {
          EMAIL: {
            outboundThreads: 10,
            repliedThreads: 3,
            replyRate: 0.3,
            appointmentsBooked: 2,
          },
          TELEGRAM: {
            outboundThreads: 4,
            repliedThreads: 1,
            replyRate: 0.25,
            appointmentsBooked: 0,
          },
        },
        recommendation: {
          channel: 'EMAIL' as const,
          market: 'Italia',
          city: 'Milano',
          readyLeads: 12,
          reason: 'Email sta rendendo meglio sui dati disponibili.',
        },
        actions: [
          'Prepara la call: Osteria Test alle 15:00.',
          'Gestisci prima 2 conversazioni calde.',
          'Avvia una campagna email su Milano.',
        ],
        summary:
          'Ciao Attilio, oggi hai 1 appuntamento. Per oggi ti consiglio email: sta rendendo meglio. Per le nuove email partirei da Milano.',
      };
    },

    async getActiveCommercialGoal() {
      return null;
    },

    async getCommercialGoalPlan() {
      return null;
    },
    async getCommercialInsights(windowDays = 30) {
      return {
        windowDays,
        generatedAt: '2026-08-25T10:00:00.000Z',
        metrics: {
          inboundClassified: 0,
          pricingRequests: 0,
          discountRequests: 0,
          appointmentsBooked: 0,
          humanHandoffs: 0,
          proactiveFollowUps: 0,
          ownerCtaClicks: 0,
        },
        recommendations: ['Verifica i canali inbound: nel periodo non risultano conversazioni classificate.'],
      };
    },
    async listConversations() {
      return seed?.conversations ?? [];
    },
    async getConversation(threadId) {
      return seed?.conversations?.find((c) => c.threadId === threadId) ?? null;
    },
    async getTelegramInboundStatus() {
      return (
        seed?.telegram ?? {
          enabled: false,
          replyEnabled: true,
          mode: 'mock',
          summary:
            'Telegram non è in ascolto. Intercetta richieste inbound già configurate; non cerca lead e non crea campagne.',
        }
      );
    },
    async listTemplates() {
      return seed?.templates ?? [];
    },
    async listDemos() {
      return seed?.demos ?? [];
    },
    async inspectDemo(demoId) {
      return seed?.demos?.find((d) => d.id === demoId) ?? null;
    },
    async inspectTemplate(templateId) {
      return seed?.templates?.find((t) => t.id === templateId) ?? null;
    },
    async listCalendarEvents() {
      return [];
    },
    async listAvailableSlots() {
      return [];
    },
    async getCalendarSummary() {
      return {
        scheduledAppointments: 0,
        completedAppointments: 0,
        cancelledAppointments: 0,
        upcomingThisWeek: 0,
        availableSlots: 0,
        nextAppointments: [],
        periodLabel: 'prossimi 14 giorni',
      };
    },
  };
}
