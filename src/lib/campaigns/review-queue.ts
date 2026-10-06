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

export function reviewBlockers(input: {
  deliveryMode: 'PRODUCTION' | 'TEST';
  leadEmail: string | null;
  emailStatus: string | null;
  testRecipient: string | null;
  testRecipientAllowed: boolean;
  hasDemo: boolean;
  failed: boolean;
  hasMessage: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.deliveryMode === 'PRODUCTION') {
    if (!input.leadEmail) blockers.push('EMAIL_NOT_FOUND');
    if (input.emailStatus === 'NOT_FOUND' || input.emailStatus === 'EMAIL_NOT_FOUND') {
      blockers.push('EMAIL_NOT_FOUND');
    }
  } else if (!input.testRecipient) {
    blockers.push('TEST_RECIPIENT_MISSING');
  } else if (!input.testRecipientAllowed) {
    blockers.push('TEST_RECIPIENT_NOT_ALLOWED');
  }
  if (!input.hasDemo) blockers.push('DEMO_NOT_READY');
  if (input.failed) blockers.push('PREPARATION_FAILED');
  if (!input.hasMessage) blockers.push('MESSAGE_NOT_READY');
  return blockers;
}

export async function queueMissingMessageDrafts(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { data: rows, error } = await admin
    .from('campaign_leads')
    .select('id, lead_id, demo_site_id, sequence_step')
    .eq('workspace_id', workspaceId)
    .in('status', ['READY', 'REVIEW'])
    .not('demo_site_id', 'is', null);
  if (error) throw new Error(`Messaggi mancanti: ${error.message}`);
  const candidates = (rows ?? []).filter((row) => (row.sequence_step ?? 0) === 0);
  if (!candidates.length) return 0;

  const ids = candidates.map((row) => row.id);
  const keys = ids.map((id) => `MESSAGE_GENERATION:campaign_lead:${id}:step:0`);
  const [{ data: drafts, error: draftError }, { data: jobs, error: jobError }] = await Promise.all([
    admin
      .from('message_drafts')
      .select('campaign_lead_id, sequence_step, subject, body')
      .in('campaign_lead_id', ids),
    admin.from('automation_jobs').select('id, status, idempotency_key').in('idempotency_key', keys),
  ]);
  if (draftError) throw new Error(`Messaggi mancanti: ${draftError.message}`);
  if (jobError) throw new Error(`Messaggi mancanti: ${jobError.message}`);

  const written = new Set(
    (drafts ?? [])
      .filter(
        (row) =>
          (row.sequence_step ?? 0) === 0 && Boolean(row.subject?.trim()) && Boolean(row.body?.trim()),
      )
      .map((row) => row.campaign_lead_id),
  );
  const jobsByKey = new Map((jobs ?? []).map((row) => [row.idempotency_key, row]));
  const queue = new SupabaseJobQueue(admin);
  let queued = 0;

  for (const row of candidates) {
    if (written.has(row.id)) continue;
    const key = `MESSAGE_GENERATION:campaign_lead:${row.id}:step:0`;
    const job = jobsByKey.get(key);
    if (job && ['QUEUED', 'RUNNING', 'RETRYING'].includes(job.status)) continue;
    if (job) {
      const { error: retryError } = await admin
        .from('automation_jobs')
        .update({
          status: 'QUEUED',
          attempt_count: 0,
          error_code: null,
          error_detail: null,
          next_retry_at: null,
          lease_owner: null,
          lease_expires_at: null,
          started_at: null,
          completed_at: null,
          cancelled_at: null,
        })
        .eq('id', job.id);
      if (retryError) throw new Error(`Messaggi mancanti: ${retryError.message}`);
      queued += 1;
      continue;
    }
    await queue.enqueue({
      workspaceId,
      jobType: 'MESSAGE_GENERATION',
      entityType: 'campaign_lead',
      entityId: row.id,
      idempotencyKey: key,
      inputSnapshot: {
        leadId: row.lead_id,
        demoId: row.demo_site_id,
        sequenceStep: 0,
      },
      priority: 70,
    });
    queued += 1;
  }
  return queued;
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

    const blockers = reviewBlockers({
      deliveryMode,
      leadEmail: lead.email ?? null,
      emailStatus,
      testRecipient,
      testRecipientAllowed: Boolean(testRecipient && isTestRecipientAllowlisted(testRecipient)),
      hasDemo: Boolean(row.demo_site_id),
      failed: row.status === 'FAILED',
      hasMessage: Boolean(draft?.subject?.trim() && draft.body?.trim()),
    });

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
      messagePreview: body
        ? `${(row.sequence_step ?? 0) > 0 ? `Follow-up ${row.sequence_step}: ` : ''}${stripHtml(body).slice(0, 220)}`
        : 'Anteprima non ancora generata.',
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

export type SendReleaseDecision = 'queue' | 'requeue' | 'waiting' | 'already_sent' | 'missing_draft';

export type SendReleaseResult = {
  approved: number;
  queued: number;
  requeued: number;
  waiting: number;
  alreadySent: number;
  missingDraft: number;
};

const ACTIVE_SEND_JOBS = new Set(['QUEUED', 'RUNNING', 'RETRYING']);
const FINISHED_SEND_JOBS = new Set(['FAILED', 'CANCELLED', 'SUCCEEDED']);

export function sendJobKey(campaignLeadId: string, sequenceStep: number): string {
  return `SEND_MESSAGE:campaign_lead:${campaignLeadId}:step:${sequenceStep}`;
}

/** A contact already marked approved must still be queued if no email has left. */
export function decideSendRelease(input: {
  hasDraft: boolean;
  hasOutbound: boolean;
  jobStatus: string | null;
}): SendReleaseDecision {
  if (input.hasOutbound) return 'already_sent';
  if (!input.hasDraft) return 'missing_draft';
  if (input.jobStatus && ACTIVE_SEND_JOBS.has(input.jobStatus)) return 'waiting';
  if (input.jobStatus && FINISHED_SEND_JOBS.has(input.jobStatus)) return 'requeue';
  return 'queue';
}

export function emptySendRelease(): SendReleaseResult {
  return { approved: 0, queued: 0, requeued: 0, waiting: 0, alreadySent: 0, missingDraft: 0 };
}

export function describeSendRelease(result: SendReleaseResult): string {
  const started = result.queued + result.requeued;
  if (started > 0) {
    return `Ho messo in coda ${started} ${started === 1 ? 'invio' : 'invii'}. Partono al prossimo giro di elaborazione.`;
  }
  if (result.waiting > 0) {
    return `${result.waiting} ${result.waiting === 1 ? 'invio è' : 'invii sono'} già in coda. Non serve un altro sblocco.`;
  }
  if (result.alreadySent > 0) {
    return 'Questi messaggi risultano già spediti.';
  }
  if (result.missingDraft > 0) {
    return 'Manca la bozza del messaggio, quindi non posso spedire.';
  }
  return 'Nessun contatto pronto da spedire.';
}

export async function approveCampaignLeads(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
  campaignLeadIds?: string[],
): Promise<SendReleaseResult> {
  let query = admin
    .from('campaign_leads')
    .select('id, sequence_step, lead_id, status')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .in('status', ['REVIEW', 'READY', 'APPROVED']);

  if (campaignLeadIds?.length) {
    query = query.in('id', campaignLeadIds);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Approve: ${error.message}`);
  const result = emptySendRelease();
  if (!rows?.length) return result;

  const ids = rows.map((row) => row.id);
  const keys = rows.map((row) => sendJobKey(row.id, row.sequence_step ?? 0));
  const [{ data: drafts, error: draftError }, { data: messages, error: messageError }, { data: jobs, error: jobError }] =
    await Promise.all([
      admin.from('message_drafts').select('campaign_lead_id, sequence_step').in('campaign_lead_id', ids),
      admin
        .from('messages')
        .select('campaign_lead_id, sequence_step')
        .eq('direction', 'OUTBOUND')
        .in('campaign_lead_id', ids),
      admin.from('automation_jobs').select('id, status, idempotency_key').in('idempotency_key', keys),
    ]);
  if (draftError) throw new Error(`Approve: bozze — ${draftError.message}`);
  if (messageError) throw new Error(`Approve: messaggi — ${messageError.message}`);
  if (jobError) throw new Error(`Approve: lavori — ${jobError.message}`);

  const draftKeys = new Set(
    (drafts ?? []).map((row) => `${row.campaign_lead_id}:${row.sequence_step ?? 0}`),
  );
  const sentKeys = new Set(
    (messages ?? []).map((row) => `${row.campaign_lead_id}:${row.sequence_step ?? 0}`),
  );
  const jobsByKey = new Map((jobs ?? []).map((row) => [row.idempotency_key, row]));
  const toApprove: string[] = [];
  const queue = new SupabaseJobQueue(admin);

  for (const row of rows) {
    const step = row.sequence_step ?? 0;
    const pair = `${row.id}:${step}`;
    const decision = decideSendRelease({
      hasDraft: draftKeys.has(pair),
      hasOutbound: sentKeys.has(pair),
      jobStatus: jobsByKey.get(sendJobKey(row.id, step))?.status ?? null,
    });
    if (decision === 'already_sent') {
      result.alreadySent += 1;
      continue;
    }
    if (decision === 'missing_draft') {
      result.missingDraft += 1;
      continue;
    }
    if (row.status === 'REVIEW' || row.status === 'READY') toApprove.push(row.id);
    if (decision === 'waiting') {
      result.waiting += 1;
      continue;
    }
    if (decision === 'requeue') {
      const job = jobsByKey.get(sendJobKey(row.id, step));
      const { error: retryError } = await admin
        .from('automation_jobs')
        .update({
          status: 'QUEUED',
          attempt_count: 0,
          error_code: null,
          error_detail: null,
          next_retry_at: null,
          lease_owner: null,
          lease_expires_at: null,
          started_at: null,
          completed_at: null,
          cancelled_at: null,
        })
        .eq('id', job!.id);
      if (retryError) throw new Error(`Approve: riaccodo fallito — ${retryError.message}`);
      result.requeued += 1;
      continue;
    }
    await queue.enqueue({
      workspaceId,
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: row.id,
      idempotencyKey: sendJobKey(row.id, step),
      inputSnapshot: {
        sequenceStep: step,
        leadId: row.lead_id,
        manualFollowup: step >= 1,
      },
      priority: 80,
    });
    result.queued += 1;
  }

  if (toApprove.length > 0) {
    const { error: updError } = await admin
      .from('campaign_leads')
      .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
      .in('id', toApprove);
    if (updError) throw new Error(`Approve: update fallito — ${updError.message}`);
    result.approved = toApprove.length;
  }

  return result;
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
