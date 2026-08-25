import { getDashboardStats } from '@/lib/dashboard/stats';
import { getInboxConversation } from '@/lib/inbound/conversation';
import { listInboxThreads } from '@/lib/inbound/list-inbox';
import { listReviewQueue } from '@/lib/campaigns/review-queue';
import { getOutreachPausedAll } from '@/lib/settings/outreach-pause';
import { resolveAppUrl } from '@/lib/app-url';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { europeRomeDayRange } from './time';
import type {
  BlockerItem,
  CampaignDetail,
  CampaignSummary,
  ConversationHit,
  CountMetric,
  DailyReport,
  LeadSearchHit,
  OperatorDataSource,
  ReviewItem,
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
        query = query.ilike('category', `%${input.category.trim().replace(/[%_]/g, '')}%`);
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
      };
    },
  };
}

export function createMemoryOperatorData(seed?: {
  leads?: LeadSearchHit[];
  campaigns?: CampaignDetail[];
  blockers?: BlockerItem[];
  review?: ReviewItem[];
  daily?: DailyReport;
  conversations?: ConversationHit[];
  dashboard?: Record<string, number>;
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
    async listConversations() {
      return seed?.conversations ?? [];
    },
    async getConversation(threadId) {
      return seed?.conversations?.find((c) => c.threadId === threadId) ?? null;
    },
  };
}
