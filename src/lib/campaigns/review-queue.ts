import { formatEmailEvidenceLabel } from '@/lib/enrichment/email-from-website';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { EMAIL_PREVIEW_CACHE_VERSION } from '@/lib/messaging/constants';
import { isTestRecipientAllowlisted } from '@/lib/campaigns/test-delivery';

export interface ReviewQueueItem {
  id: string;
  campaignId: string;
  status: string;
  companyName: string;
  category: string;
  city: string;
  score: number;
  confidence: number;
  email: string | null;
  emailEvidenceLabel: string | null;
  deliveryMode: 'PRODUCTION' | 'TEST';
  testRecipient: string | null;
  subject: string;
  messagePreview: string;
  body: string;
  previewImageUrl: string | null;
  demoUrl: string | null;
  demoSiteId: string | null;
  sequenceStep: number;
  blockers: string[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function listReviewQueue(
  admin: AppSupabaseClient,
  workspaceId: string,
  appUrl: string,
): Promise<ReviewQueueItem[]> {
  const { data: rows, error } = await admin
    .from('campaign_leads')
    .select('id, campaign_id, status, lead_id, demo_site_id, sequence_step, preparation')
    .eq('workspace_id', workspaceId)
    .in('status', ['REVIEW', 'READY', 'GENERATING', 'FAILED', 'PENDING'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Review queue: ${error.message}`);
  if (!rows?.length) return [];

  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  const demoIds = rows.map((r) => r.demo_site_id).filter(Boolean) as string[];
  const clIds = rows.map((r) => r.id);
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];

  const [leadsRes, demosRes, draftsRes, campaignsRes] = await Promise.all([
    admin
      .from('leads')
      .select('id, name, category, city, email, discovery_score, discovery_confidence')
      .in('id', leadIds),
    demoIds.length
      ? admin.from('demo_sites').select('id, slug, public_url').in('id', demoIds)
      : Promise.resolve({
          data: [] as { id: string; slug: string; public_url: string | null }[],
          error: null,
        }),
    admin
      .from('message_drafts')
      .select('campaign_lead_id, subject, body, sequence_step')
      .in('campaign_lead_id', clIds),
    admin
      .from('campaigns')
      .select('id, delivery_mode, test_recipient, name')
      .in('id', campaignIds),
  ]);

  if (leadsRes.error) throw new Error(`Review queue leads: ${leadsRes.error.message}`);
  if (demosRes.error) throw new Error(`Review queue demos: ${demosRes.error.message}`);
  if (draftsRes.error) throw new Error(`Review queue drafts: ${draftsRes.error.message}`);
  if (campaignsRes.error) throw new Error(`Review queue campaigns: ${campaignsRes.error.message}`);

  const leads = leadsRes.data ?? [];
  const demos = demosRes.data ?? [];
  const drafts = draftsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const demoById = new Map(demos.map((d) => [d.id, d]));
  const draftByCl = new Map(
    drafts.map((d) => [`${d.campaign_lead_id}:${d.sequence_step ?? 0}`, d]),
  );
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  return rows.map((row) => {
    const lead = leadById.get(row.lead_id);
    if (!lead) {
      throw new Error(`Review queue: lead ${row.lead_id} non trovato (query/schema drift)`);
    }
    const demo = row.demo_site_id ? demoById.get(row.demo_site_id) : null;
    const draft = draftByCl.get(`${row.id}:${row.sequence_step ?? 0}`);
    const prep = (row.preparation ?? {}) as Record<string, unknown>;
    const emailStatus = typeof prep.emailStatus === 'string' ? prep.emailStatus : null;
    const emailEvidence = (prep.emailEvidence ?? null) as {
      sourceUrl?: string | null;
      sourceType?: string | null;
      confidence?: number | null;
      email?: string | null;
    } | null;
    const emailEvidenceLabel =
      lead.email && emailEvidence
        ? formatEmailEvidenceLabel(emailEvidence)
        : lead.email && typeof prep.emailSourceUrl === 'string'
          ? formatEmailEvidenceLabel({
              sourceUrl: prep.emailSourceUrl,
              sourceType: typeof prep.emailSourceType === 'string' ? prep.emailSourceType : null,
              confidence: typeof prep.emailConfidence === 'number' ? prep.emailConfidence : null,
            })
          : null;
    const publicPath = demo?.public_url ?? (demo?.slug ? `/demo/${demo.slug}` : null);
    const demoUrl = publicPath ? `${appUrl}${publicPath}` : null;
    const previewImageUrl = publicPath
      ? `${appUrl}${publicPath}/email-preview?v=${EMAIL_PREVIEW_CACHE_VERSION}`
      : null;
    const body = draft?.body ?? '';

    const campaign = campaignById.get(row.campaign_id);
    const deliveryMode =
      campaign?.delivery_mode === 'TEST' ? ('TEST' as const) : ('PRODUCTION' as const);
    const testRecipient =
      typeof campaign?.test_recipient === 'string' ? campaign.test_recipient : null;

    const blockers: string[] = [];
    if (deliveryMode === 'PRODUCTION') {
      if (!lead.email) blockers.push('EMAIL_NOT_FOUND');
      if (emailStatus === 'NOT_FOUND' || emailStatus === 'EMAIL_NOT_FOUND') {
        blockers.push('EMAIL_NOT_FOUND');
      }
    } else if (!testRecipient) {
      blockers.push('TEST_RECIPIENT_MISSING');
    } else if (!isTestRecipientAllowlisted(testRecipient)) {
      blockers.push('TEST_RECIPIENT_NOT_ALLOWED');
    }
    if (!row.demo_site_id) blockers.push('DEMO_NOT_READY');
    if (row.status === 'FAILED') blockers.push('PREPARATION_FAILED');

    return {
      id: row.id,
      campaignId: row.campaign_id,
      status: row.status,
      companyName: lead.name,
      category: lead.category ?? '—',
      city: lead.city ?? '—',
      score: lead.discovery_score ?? 0,
      confidence: lead.discovery_confidence ?? 0,
      email: lead.email ?? null,
      emailEvidenceLabel,
      deliveryMode,
      testRecipient,
      subject: draft?.subject ?? '(messaggio in preparazione)',
      messagePreview: body ? stripHtml(body).slice(0, 220) : 'Anteprima non ancora generata.',
      body,
      previewImageUrl,
      demoUrl,
      demoSiteId: row.demo_site_id ?? null,
      sequenceStep: row.sequence_step ?? 0,
      blockers,
    };
  });
}

export async function updateDraftContent(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  patch: { subject?: string; body?: string },
) {
  const { data: cl, error: clError } = await admin
    .from('campaign_leads')
    .select('id, sequence_step')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId)
    .maybeSingle();
  if (clError || !cl) throw new Error(clError?.message ?? 'Lead campagna non trovato');

  const step = cl.sequence_step ?? 0;
  const updates: {
    is_override: boolean;
    updated_at: string;
    subject?: string;
    body?: string;
  } = {
    is_override: true,
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.subject === 'string') updates.subject = patch.subject;
  if (typeof patch.body === 'string') updates.body = patch.body;
  if (updates.subject === undefined && updates.body === undefined) {
    throw new Error('Fornire subject e/o body');
  }

  const { data: draft, error } = await admin
    .from('message_drafts')
    .update(updates)
    .eq('workspace_id', workspaceId)
    .eq('campaign_lead_id', campaignLeadId)
    .eq('sequence_step', step)
    .select('id, subject, body')
    .maybeSingle();

  if (error) throw new Error(`Draft update fallito — ${error.message}`);
  if (!draft) throw new Error('Bozza messaggio non trovata');
  return draft;
}

export async function approveCampaignLeads(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
  campaignLeadIds?: string[],
) {
  let query = admin
    .from('campaign_leads')
    .select('id, sequence_step, demo_site_id, lead_id')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .in('status', ['REVIEW', 'READY']);

  if (campaignLeadIds?.length) {
    query = query.in('id', campaignLeadIds);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Approve: ${error.message}`);
  if (!rows?.length) return { approved: 0 };

  const ids = rows.map((r) => r.id);
  const { error: updError } = await admin
    .from('campaign_leads')
    .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (updError) throw new Error(`Approve: update fallito — ${updError.message}`);

  const queue = new SupabaseJobQueue(admin);
  for (const row of rows) {
    if (!row.demo_site_id) continue;
    await queue.enqueue({
      workspaceId,
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: row.id,
      idempotencyKey: `SEND_MESSAGE:campaign_lead:${row.id}:step:${row.sequence_step ?? 0}`,
      inputSnapshot: { sequenceStep: row.sequence_step ?? 0, leadId: row.lead_id },
      priority: 80,
    });
  }

  return { approved: rows.length };
}

export async function updateCampaignLeadStatus(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  status: 'SKIPPED' | 'STOPPED' | 'APPROVED',
) {
  const { error } = await admin
    .from('campaign_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId);
  if (error) throw new Error(error.message);
}
