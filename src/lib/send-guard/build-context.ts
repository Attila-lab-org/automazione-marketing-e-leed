import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPolicySnapshot,
  evaluatePolicyGate,
  resolvePolicy,
  DEFAULT_WORKSPACE_POLICY,
} from '@/lib/domain/policy';
import { getOutreachPausedAll } from '@/lib/settings/outreach-pause';
import type { SendGuardContext } from '@/lib/send-guard';
import type {
  BusinessStatus,
  CampaignStatus,
  DraftStatus,
  LeadScore,
  PolicyConfig,
} from '@/lib/types/domain';
import {
  isTestRecipientAllowlisted,
  isValidEmailShape,
  normalizeEmailAddress,
} from '@/lib/campaigns/test-delivery';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isWithinSendWindow(
  window: { start?: string; end?: string; timezone?: string } | null,
  now: Date = new Date(),
): boolean {
  if (!window?.start || !window?.end) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: window.timezone || 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const current = hour * 60 + minute;
  const [sh, sm] = window.start.split(':').map(Number);
  const [eh, em] = window.end.split(':').map(Number);
  const start = (sh ?? 0) * 60 + (sm ?? 0);
  const end = (eh ?? 23) * 60 + (em ?? 59);
  return current >= start && current <= end;
}

function discoveryScoreToLeadScore(
  opportunity: number | null | undefined,
  confidence: number | null | undefined,
  contactability: number,
): LeadScore | null {
  if (opportunity == null && confidence == null) return null;
  return {
    algorithmVersion: 'discovery',
    opportunityScore: opportunity ?? 0,
    contactabilityScore: contactability,
    dataConfidenceScore: confidence ?? 0,
    templateMatchScore: 0,
    businessPotentialScore: 0,
    totalScore: opportunity ?? 0,
    confidence: confidence ?? 0,
    breakdown: {
      opportunity: { score: opportunity ?? 0, weight: 0.3, signals: [] },
      contactability: { score: contactability, weight: 0.2, signals: [] },
      data_confidence: { score: confidence ?? 0, weight: 0.2, signals: [] },
      template_match: { score: 0, weight: 0.1, signals: [] },
      business_potential: { score: 0, weight: 0.2, signals: [] },
    },
    reasons: [],
  };
}

/**
 * Build Send Guard context.
 * PRODUCTION: recipient = lead.email (required).
 * TEST: recipient = campaign.test_recipient (actual delivery); prospect email optional.
 */
export async function buildSendGuardContext(
  admin: SupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  sequenceStep: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SendGuardContext> {
  const paused = await getOutreachPausedAll(admin, workspaceId);

  const { data: cl, error } = await admin
    .from('campaign_leads')
    .select('id, lead_id, demo_site_id, status, campaign_id, sequence_step, policy_snapshot')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId)
    .single();
  if (error || !cl) throw new Error(`SendGuard: campaign_lead non trovato — ${error?.message ?? ''}`);

  const [{ data: lead }, { data: campaign }, { data: draft }, { data: demo }] = await Promise.all([
    admin
      .from('leads')
      .select('email, business_status, discovery_score, discovery_confidence')
      .eq('id', cl.lead_id)
      .single(),
    admin
      .from('campaigns')
      .select(
        'status, rate_limit_per_hour, daily_send_limit, send_window, delivery_mode, test_recipient',
      )
      .eq('id', cl.campaign_id)
      .single(),
    admin
      .from('message_drafts')
      .select('subject, body, status')
      .eq('campaign_lead_id', cl.id)
      .eq('sequence_step', sequenceStep)
      .maybeSingle(),
    cl.demo_site_id
      ? admin.from('demo_sites').select('id, slug, public_url').eq('id', cl.demo_site_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const isTest = campaign?.delivery_mode === 'TEST';
  const leadEmail = lead?.email ?? null;

  // Guard validates EFFECTIVE recipient: TEST → allowlisted test_recipient; PRODUCTION → lead email
  let recipientEmail: string | null = leadEmail;
  if (isTest) {
    const testRaw = campaign?.test_recipient?.trim() ?? '';
    recipientEmail =
      testRaw && isValidEmailShape(testRaw) && isTestRecipientAllowlisted(testRaw, env)
        ? normalizeEmailAddress(testRaw)
        : testRaw || null;
  }

  const emailValid = Boolean(recipientEmail && isValidEmailShape(recipientEmail));
  const normalized = recipientEmail ? normalizeEmail(recipientEmail) : null;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [
    { data: suppression },
    { data: inbound },
    { data: repliedEvt },
    { data: alreadySent },
    { count: sentLastHour },
    { count: sentToday },
  ] = await Promise.all([
    normalized
      ? admin
          .from('suppression_list')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('normalized_email', normalized)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('messages')
      .select('id')
      .eq('campaign_lead_id', cl.id)
      .eq('direction', 'INBOUND')
      .limit(1)
      .maybeSingle(),
    admin
      .from('message_events')
      .select('id, messages!inner(campaign_lead_id)')
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'REPLIED')
      .eq('messages.campaign_lead_id', cl.id)
      .limit(1)
      .maybeSingle(),
    admin
      .from('messages')
      .select('id')
      .eq('campaign_lead_id', cl.id)
      .eq('sequence_step', sequenceStep)
      .eq('direction', 'OUTBOUND')
      .limit(1)
      .maybeSingle(),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('direction', 'OUTBOUND')
      .gte('created_at', hourAgo),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('direction', 'OUTBOUND')
      .gte('created_at', dayStart.toISOString()),
  ]);

  const ratePerHour = campaign?.rate_limit_per_hour ?? 20;
  const dailyLimit = campaign?.daily_send_limit ?? 100;
  const sendWindow = (campaign?.send_window ?? {}) as {
    start?: string;
    end?: string;
    timezone?: string;
  };
  const withinSendWindow = isWithinSendWindow(sendWindow);
  const hourlyRateAvailable = (sentLastHour ?? 0) < ratePerHour;
  const dailyRateAvailable = (sentToday ?? 0) < dailyLimit;
  const rateLimitAvailable = hourlyRateAvailable && dailyRateAvailable;

  const snap = (cl.policy_snapshot ?? {}) as Record<string, unknown>;
  const mode = (snap.mode as PolicyConfig['mode']) ?? 'MANUAL';
  const actions = (snap.actions as PolicyConfig['actions']) ?? DEFAULT_WORKSPACE_POLICY.actions;
  const config = resolvePolicy(DEFAULT_WORKSPACE_POLICY, {
    mode,
    actions,
    rateLimit: { perHour: ratePerHour, perDay: dailyLimit },
  });
  const policySnap = createPolicySnapshot(config, {
    policyVersionId: String(snap.policyVersionId ?? 'unknown'),
    campaignId: cl.campaign_id,
    version: 1,
  });
  // Policy validEmail: PRODUCTION needs lead email; TEST uses effective recipient validity
  const evaluation = evaluatePolicyGate(policySnap, {
    action: 'send',
    score: discoveryScoreToLeadScore(
      lead?.discovery_score,
      lead?.discovery_confidence,
      emailValid ? 90 : isTest ? 70 : 0,
    ),
    validEmail: emailValid,
    businessStatus: (lead?.business_status as BusinessStatus) ?? 'NEW',
  });

  const draftStatus: DraftStatus =
    draft?.status === 'READY' || draft?.status === 'APPROVED' ? 'APPROVED' : 'DRAFT';

  return {
    recipient: {
      email: recipientEmail,
      emailValid,
      suppressed: Boolean(suppression?.id),
    },
    lead: {
      businessStatus: (lead?.business_status as BusinessStatus) ?? 'NEW',
      hasBlockingReply: Boolean(inbound?.id || repliedEvt?.id),
    },
    campaign: {
      status: (campaign?.status as CampaignStatus) ?? 'PAUSED',
      rateLimitAvailable,
      hourlyRateAvailable,
      dailyRateAvailable,
      withinSendWindow,
      sendWindow,
      outreachPausedAll: paused,
    },
    policy: {
      evaluation,
      humanApproved: ['APPROVED', 'SENDING', 'SENT'].includes(cl.status),
    },
    message: {
      subject: draft?.subject ?? '',
      body: draft?.body ?? '',
      status: draftStatus,
    },
    demo: {
      required: true,
      demoReady: Boolean(cl.demo_site_id && demo),
      screenshotReady: Boolean(demo?.slug || demo?.public_url),
    },
    idempotency: {
      alreadySent: Boolean(alreadySent?.id),
    },
  };
}
