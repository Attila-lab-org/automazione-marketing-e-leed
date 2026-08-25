import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { createDemoFromLead } from '@/lib/demos/create';
import { enrichLeadEmail } from '@/lib/enrichment/enrich-lead-email';
import { enrichLeadFromGoogleIfNeeded } from '@/lib/leads/google-enrich';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import { RESTAURANT_PREMIUM_V2_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import { pickCompatibleTemplateKey } from '@/lib/templates/match';
import { listPublishedTemplates } from '@/lib/demos/ensure-template';
import { ensureRestaurantPremiumV3 } from '@/lib/demos/ensure-template-v3';
import { buildVisualEmailDraft, buildFollowupDraft } from '@/lib/messaging/visual-email';
import { emailHtmlToText } from '@/lib/messaging/html-to-text';
import { buildSendGuardContext } from '@/lib/send-guard/build-context';
import { runSendGuard } from '@/lib/send-guard';
import {
  classifySendGuardDisposition,
  PAUSE_RETRY_MS,
  SendDeferredError,
} from '@/lib/send-guard/defer';

import { getResendProvider } from '@/lib/providers/resend';
import { mergePreparation } from '@/lib/campaigns/preparation';
import {
  BlockedTestRecipientError,
  resolveTestDelivery,
  testSequenceDelayMs,
} from '@/lib/campaigns/test-delivery';
import { applyAiOutboundIfAllowed } from '@/lib/messaging/ai-outbound';
import { analyzeLeadWebsite } from '@/lib/intelligence/analyze';
import { ensureMessageThread } from '@/lib/messaging/persist';

type JobRef = {
  id: string;
  jobType: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  inputSnapshot: Record<string, unknown>;
};

async function loadPreparation(admin: SupabaseClient, campaignLeadId: string) {
  const { data } = await admin
    .from('campaign_leads')
    .select('preparation')
    .eq('id', campaignLeadId)
    .maybeSingle();
  return data?.preparation ?? {};
}

async function updateCampaignLead(
  admin: SupabaseClient,
  campaignLeadId: string,
  patch: Record<string, unknown>,
  prepPatch?: Record<string, unknown>,
) {
  const current = await loadPreparation(admin, campaignLeadId);
  const update: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  if (prepPatch) update.preparation = mergePreparation(current, prepPatch);
  await admin.from('campaign_leads').update(update).eq('id', campaignLeadId);
}

export async function handleJob(
  admin: SupabaseClient,
  job: JobRef,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  switch (job.jobType) {
    case 'WEBSITE_ANALYSIS':
      return handleWebsiteAnalysis(admin, job, env);
    case 'LEAD_ENRICHMENT':
      return handleLeadEnrichment(admin, job, env);
    case 'DEMO_GENERATION':
      return handleDemoGeneration(admin, job);
    case 'MESSAGE_GENERATION':
      return handleMessageGeneration(admin, job, env);
    case 'SEND_MESSAGE':
      return handleSendMessage(admin, job, env);
    case 'FOLLOWUP_STEP':
      return handleFollowupStep(admin, job, env);
    case 'CALENDAR_REMINDER':
      return handleCalendarReminder(admin, job);
    case 'SALES_PROACTIVE_STEP':
      return handleSalesProactiveStep(admin, job);
    default:
      return { skipped: true, reason: `Unsupported job type ${job.jobType}` };
  }
}

async function handleSalesProactiveStep(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
) {
  const { runProactiveSalesStep } = await import('@/lib/sales/proactive');
  const threadId = String(job.inputSnapshot.threadId ?? job.entityId);
  return runProactiveSalesStep({
    admin: admin as AppSupabaseClient,
    workspaceId: job.workspaceId,
    threadId,
  });
}

async function handleCalendarReminder(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
) {
  const { fireCalendarReminder } = await import('@/lib/calendar/service');
  const eventId = String(job.inputSnapshot.eventId ?? job.entityId);
  return fireCalendarReminder(admin as AppSupabaseClient, job.workspaceId, eventId);
}

async function handleWebsiteAnalysis(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
  env: NodeJS.ProcessEnv,
) {
  const leadId = String(job.inputSnapshot.leadId ?? job.entityId);
  try {
    const result = await analyzeLeadWebsite({
      admin: admin as AppSupabaseClient,
      workspaceId: job.workspaceId,
      leadId,
      env,
    });
    return {
      opportunityScore: result.opportunity.aiOpportunityScore,
      retrieved: result.snapshot.retrieved,
    };
  } catch (err) {
    return {
      deferred: true,
      reason: err instanceof Error ? err.message : 'website_analysis_failed',
    };
  }
}

async function handleLeadEnrichment(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
  env: NodeJS.ProcessEnv,
) {
  const leadId = String(job.inputSnapshot.leadId ?? '');
  const google = await enrichLeadFromGoogleIfNeeded(admin, job.workspaceId, leadId, env);
  const email = await enrichLeadEmail(admin, job.workspaceId, leadId);

  const { data: clRow } = await admin
    .from('campaign_leads')
    .select('campaign_id')
    .eq('id', job.entityId)
    .maybeSingle();
  const { data: campaign } = clRow?.campaign_id
    ? await admin
        .from('campaigns')
        .select('delivery_mode')
        .eq('id', clRow.campaign_id)
        .maybeSingle()
    : { data: null };
  const isTestCampaign = campaign?.delivery_mode === 'TEST';

  // PRODUCTION: prospect email required. TEST: continue without skip (intended may be null).
  if (!email.email && !isTestCampaign) {
    await updateCampaignLead(
      admin,
      job.entityId,
      { status: 'SKIPPED' },
      {
        emailStatus: 'EMAIL_NOT_FOUND',
        emailEvidence: email,
        googleEnrichment: google,
        blockers: ['EMAIL_NOT_FOUND'],
      },
    );
    return { emailStatus: 'EMAIL_NOT_FOUND' };
  }

  await updateCampaignLead(
    admin,
    job.entityId,
    { status: 'GENERATING' },
    {
      emailStatus: email.email ? email.status : 'EMAIL_NOT_FOUND',
      email: email.email ?? null,
      emailSourceUrl: email.sourceUrl ?? null,
      emailSourceType: email.sourceType ?? null,
      emailConfidence: email.confidence ?? null,
      emailSameDomain: email.sameDomain ?? null,
      emailEvidence: email,
      googleEnrichment: google,
      intendedRecipientAvailable: Boolean(email.email),
      enrichedAt: new Date().toISOString(),
    },
  );

  await admin
    .from('leads')
    .update({ business_status: 'CAMPAIGN_READY', updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .in('business_status', ['NEW', 'QUALIFIED', 'CAMPAIGN_READY']);

  const queue = new SupabaseJobQueue(admin);
  const analysisJob = await queue.enqueue({
    workspaceId: job.workspaceId,
    jobType: 'WEBSITE_ANALYSIS',
    entityType: 'lead',
    entityId: leadId,
    idempotencyKey: `WEBSITE_ANALYSIS:lead:${leadId}:v1`,
    inputSnapshot: { leadId, campaignLeadId: job.entityId },
    priority: 50,
  });
  await queue.enqueue({
    workspaceId: job.workspaceId,
    jobType: 'DEMO_GENERATION',
    entityType: 'campaign_lead',
    entityId: job.entityId,
    idempotencyKey: `DEMO_GENERATION:campaign_lead:${job.entityId}`,
    inputSnapshot: { leadId },
    priority: 60,
    dependsOnJobId: analysisJob.job.id,
  });

  return {
    emailStatus: email.email ? email.status : 'EMAIL_NOT_FOUND',
    intendedRecipientAvailable: Boolean(email.email),
    testContinuedWithoutEmail: isTestCampaign && !email.email,
  };
}

async function handleDemoGeneration(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
) {
  const leadId = String(job.inputSnapshot.leadId ?? '');
  const { data: lead } = await admin.from('leads').select('category').eq('id', leadId).single();
  await ensureRestaurantPremiumV3(admin, job.workspaceId);
  const published = await listPublishedTemplates(admin, job.workspaceId);
  const matched = pickCompatibleTemplateKey(
    lead?.category,
    published.map((t) => ({ key: t.templateKey, vertical: t.vertical, published: true })),
  );

  if (!matched) {
    await updateCampaignLead(
      admin,
      job.entityId,
      { status: 'SKIPPED' },
      { blockers: ['TEMPLATE_NOT_COMPATIBLE'], templateMatch: null },
    );
    return { skipped: true, reason: 'TEMPLATE_NOT_COMPATIBLE' };
  }

  const v3 = published.find(
    (t) => t.templateKey === matched && t.layoutKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  );
  const v2 = published.find(
    (t) => t.templateKey === matched && t.layoutKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  );
  const chosen = v3 ?? v2 ?? published.find((t) => t.templateKey === matched);

  if (
    !chosen ||
    (chosen.layoutKey !== RESTAURANT_PREMIUM_V3_RENDERER_KEY &&
      chosen.layoutKey !== RESTAURANT_PREMIUM_V2_RENDERER_KEY)
  ) {
    await updateCampaignLead(
      admin,
      job.entityId,
      { status: 'SKIPPED' },
      { blockers: ['TEMPLATE_NOT_COMPATIBLE'], templateMatch: matched },
    );
    return { skipped: true, reason: 'TEMPLATE_NOT_COMPATIBLE' };
  }

  const demo = await createDemoFromLead(admin, job.workspaceId, {
    leadId,
    layoutKey: chosen.layoutKey,
    templateKey: matched,
  });

  await updateCampaignLead(
    admin,
    job.entityId,
    { demo_site_id: demo.id, status: 'READY' },
    {
      demoSlug: demo.slug,
      publicPath: demo.publicPath,
      layoutKey: demo.layoutKey,
      previewPath: `${demo.publicPath}/email-preview`,
    },
  );

  const queue = new SupabaseJobQueue(admin);
  await queue.enqueue({
    workspaceId: job.workspaceId,
    jobType: 'MESSAGE_GENERATION',
    entityType: 'campaign_lead',
    entityId: job.entityId,
    idempotencyKey: `MESSAGE_GENERATION:campaign_lead:${job.entityId}:step:0`,
    inputSnapshot: { leadId, demoId: demo.id, sequenceStep: 0 },
    priority: 70,
  });

  return { demoId: demo.id, reused: demo.reused };
}

async function handleMessageGeneration(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
  env: NodeJS.ProcessEnv,
) {
  const sequenceStep = Number(job.inputSnapshot.sequenceStep ?? 0);
  const draft =
    sequenceStep === 0
      ? await buildVisualEmailDraft(admin, job.workspaceId, job.entityId, env)
      : await buildFollowupDraft(admin, job.workspaceId, job.entityId, sequenceStep, env);

  const { data: clRow } = await admin
    .from('campaign_leads')
    .select('campaign_id')
    .eq('id', job.entityId)
    .maybeSingle();
  const { data: campaignMode } = clRow?.campaign_id
    ? await admin.from('campaigns').select('delivery_mode').eq('id', clRow.campaign_id).maybeSingle()
    : { data: null };
  const ai =
    sequenceStep === 0
      ? await applyAiOutboundIfAllowed({
          admin,
          workspaceId: job.workspaceId,
          campaignLeadId: job.entityId,
          deliveryMode: campaignMode?.delivery_mode,
          env,
        })
      : { used: false, critic: null };

  await updateCampaignLead(
    admin,
    job.entityId,
    { status: sequenceStep === 0 ? 'REVIEW' : 'APPROVED' },
    { draftId: draft.draftId, subject: draft.subject, sequenceStep, aiOutbound: ai },
  );
  return { draftId: draft.draftId, subject: draft.subject, sequenceStep, aiOutbound: ai };
}

async function scheduleNextFollowup(
  admin: SupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  campaignId: string,
  currentStep: number,
  env: NodeJS.ProcessEnv,
) {
  const { data: campaign } = await admin
    .from('campaigns')
    .select('delivery_mode')
    .eq('id', campaignId)
    .single();
  const manualSteps = [
    { step: 1, delay_days: 3 },
    { step: 2, delay_days: 7 },
  ] as const;
  const next = manualSteps.find((step) => step.step === currentStep + 1);
  if (!next) {
    await updateCampaignLead(
      admin,
      campaignLeadId,
      { status: 'SENT', next_action_at: null },
      { sequenceCompleted: true, lastStep: currentStep },
    );
    return { done: true };
  }

  // Standard 0-3-7: delay_days are absolute offsets from first outbound (step 0).
  // TEST campaigns: accelerated branch — step1 +5m, step2 +10m (same engine).
  const { data: originMsg } = await admin
    .from('messages')
    .select('sent_at')
    .eq('campaign_lead_id', campaignLeadId)
    .eq('direction', 'OUTBOUND')
    .eq('sequence_step', 0)
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const origin = originMsg?.sent_at ? new Date(originMsg.sent_at) : new Date();
  const isTest = campaign?.delivery_mode === 'TEST';
  const testMs = isTest ? testSequenceDelayMs(next.step) : null;
  const notBefore = new Date(
    origin.getTime() +
      (testMs != null ? testMs : (next.delay_days ?? 0) * 24 * 60 * 60 * 1000),
  );
  if (notBefore.getTime() < Date.now()) {
    notBefore.setTime(Date.now());
  }

  await updateCampaignLead(
    admin,
    campaignLeadId,
    { sequence_step: next.step, next_action_at: notBefore.toISOString(), status: 'SENT' },
    {
      nextStep: next.step,
      nextActionAt: notBefore.toISOString(),
      deliveryMode: campaign?.delivery_mode ?? 'PRODUCTION',
      acceleratedTest: isTest,
      automaticFollowup: false,
      manualApprovalRequired: true,
    },
  );

  return {
    done: false,
    nextStep: next.step,
    notBefore: notBefore.toISOString(),
    acceleratedTest: isTest,
    automaticFollowup: false,
    manualApprovalRequired: true,
  };
}

async function handleSendMessage(
  admin: SupabaseClient,
  job: JobRef,
  env: NodeJS.ProcessEnv,
) {
  const sequenceStep = Number(job.inputSnapshot.sequenceStep ?? 0);
  const providerMode = (env.RESEND_PROVIDER_MODE ?? 'mock').toLowerCase();

  const { data: cl } = await admin
    .from('campaign_leads')
    .select('id, lead_id, campaign_id, demo_site_id')
    .eq('id', job.entityId)
    .single();
  if (!cl) throw new Error('Send: campaign_lead missing');

  const { data: campaign } = await admin
    .from('campaigns')
    .select('id, delivery_mode, test_recipient, status')
    .eq('id', cl.campaign_id)
    .single();
  if (!campaign) throw new Error('Send: campaign missing');
  const { data: leadRecipient } = await admin
    .from('leads')
    .select('email')
    .eq('id', cl.lead_id)
    .maybeSingle();

  // Live Resend unlocked only for TEST campaigns (PRODUCTION stays hard-blocked).
  if (providerMode === 'live' && campaign.delivery_mode !== 'TEST') {
    throw new Error(
      'Invio live disabilitato per campagne PRODUCTION — usa Campaign TEST oppure RESEND_PROVIDER_MODE=mock',
    );
  }

  // Live TEST must never emit localhost demo/preview URLs
  if (providerMode === 'live') {
    const { assertAppUrlSafeForLiveSend } = await import('@/lib/app-url');
    assertAppUrlSafeForLiveSend(env);
  }

  const ctx = await buildSendGuardContext(
    admin,
    job.workspaceId,
    job.entityId,
    sequenceStep,
    env,
  );
  const guard = runSendGuard(ctx);
  const disposition = classifySendGuardDisposition(ctx, guard);
  if (disposition.kind === 'defer') {
    throw new SendDeferredError(disposition);
  }
  if (disposition.kind === 'block') {
    throw new Error(disposition.detail);
  }

  let delivery;
  try {
    delivery = resolveTestDelivery({
      deliveryMode: campaign.delivery_mode,
      testRecipient: campaign.test_recipient,
      leadEmail: leadRecipient?.email ?? null,
      env,
    });
  } catch (err) {
    if (err instanceof BlockedTestRecipientError) {
      await updateCampaignLead(
        admin,
        cl.id,
        { status: 'FAILED' },
        {
          sendError: err.code,
          sendErrorDetail: err.message,
          blockedAt: new Date().toISOString(),
          sequenceStep,
        },
      );
      throw err;
    }
    throw err;
  }

  // Retry safety: never change recipient mid-flight — pin from first successful send if present
  const { data: prior } = await admin
    .from('messages')
    .select('intended_recipient, actual_delivery_recipient, to_address')
    .eq('campaign_lead_id', cl.id)
    .eq('direction', 'OUTBOUND')
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (prior?.actual_delivery_recipient || prior?.to_address) {
    const pinnedActual = (prior.actual_delivery_recipient ?? prior.to_address)!.toLowerCase();
    if (pinnedActual !== delivery.actualDeliveryRecipient) {
      throw new BlockedTestRecipientError(
        `retry recipient mismatch: pinned=${pinnedActual} resolved=${delivery.actualDeliveryRecipient}`,
      );
    }
    delivery = {
      ...delivery,
      intendedRecipient: prior.intended_recipient ?? delivery.intendedRecipient,
      actualDeliveryRecipient: pinnedActual,
    };
  }

  const { data: draft } = await admin
    .from('message_drafts')
    .select('id, subject, body')
    .eq('campaign_lead_id', cl.id)
    .eq('sequence_step', sequenceStep)
    .single();

  const fromAddress = env.RESEND_FROM?.trim();
  if (providerMode === 'live' && !fromAddress) {
    throw new Error('Invio live bloccato: mittente RESEND_FROM non configurato');
  }
  const resend = getResendProvider(env);
  const idempotencyKey = `SEND_MESSAGE:campaign_lead:${cl.id}:step:${sequenceStep}`;
  const sendResult = await resend.send({
    from: fromAddress || 'onboarding@resend.dev',
    to: delivery.actualDeliveryRecipient,
    subject: draft!.subject!,
    html: draft!.body!,
    text: emailHtmlToText(draft!.body!),
    idempotencyKey,
    headers: {
      'Reply-To': env.RESEND_REPLY_TO?.trim() || fromAddress || 'onboarding@resend.dev',
    },
  });

  const threadId = await ensureMessageThread(admin, job.workspaceId, cl.lead_id, cl.campaign_id);
  const { data: message, error: msgError } = await admin
    .from('messages')
    .insert({
      workspace_id: job.workspaceId,
      thread_id: threadId,
      lead_id: cl.lead_id,
      campaign_lead_id: cl.id,
      draft_id: draft!.id,
      direction: 'OUTBOUND',
      provider: 'resend',
      provider_message_id: sendResult.providerMessageId,
      from_address: fromAddress || 'onboarding@resend.dev',
      to_address: delivery.actualDeliveryRecipient,
      intended_recipient: delivery.intendedRecipient,
      actual_delivery_recipient: delivery.actualDeliveryRecipient,
      subject: draft!.subject!,
      body_snapshot: draft!.body!,
      sequence_step: sequenceStep,
      sent_at: sendResult.sentAt,
    })
    .select('id')
    .single();
  if (msgError) throw new Error(`Send: persist message fallito — ${msgError.message}`);

  await admin.from('message_events').insert({
    workspace_id: job.workspaceId,
    message_id: message!.id,
    event_type: 'SENT',
    provider_event_id: `${providerMode}-sent:${sendResult.providerMessageId}`,
    payload: {
      mocked: providerMode !== 'live',
      deliveryMode: delivery.deliveryMode,
      intended_recipient: delivery.intendedRecipient,
      actual_delivery_recipient: delivery.actualDeliveryRecipient,
    },
    occurred_at: sendResult.sentAt,
  });

  await admin
    .from('leads')
    .update({ business_status: 'CONTACTED', updated_at: new Date().toISOString() })
    .eq('id', cl.lead_id);

  await updateCampaignLead(
    admin,
    cl.id,
    { status: 'SENT', sequence_step: sequenceStep },
    {
      lastSentAt: sendResult.sentAt,
      lastProviderMessageId: sendResult.providerMessageId,
      intended_recipient: delivery.intendedRecipient,
      actual_delivery_recipient: delivery.actualDeliveryRecipient,
      deliveryMode: delivery.deliveryMode,
    },
  );

  const followup = await scheduleNextFollowup(
    admin,
    job.workspaceId,
    cl.id,
    cl.campaign_id,
    sequenceStep,
    env,
  );

  return {
    mocked: providerMode !== 'live',
    sequenceStep,
    provider: providerMode,
    messageId: message!.id,
    intended_recipient: delivery.intendedRecipient,
    actual_delivery_recipient: delivery.actualDeliveryRecipient,
    deliveryMode: delivery.deliveryMode,
    followup,
  };
}

async function handleFollowupStep(
  _admin: SupabaseClient,
  _job: JobRef,
  _env: NodeJS.ProcessEnv,
) {
  return { skipped: true, reason: 'MANUAL_FOLLOWUP_REQUIRED' };
}

export async function runJobBatch(
  admin: SupabaseClient,
  workspaceId: string,
  workerId: string,
  limit = 10,
  env: NodeJS.ProcessEnv = process.env,
) {
  const queue = new SupabaseJobQueue(admin);
  await queue.recoverStuckJobs();
  const results: Array<{ jobId: string; ok: boolean; deferred?: boolean; error?: string }> = [];

  for (let i = 0; i < limit; i += 1) {
    const job = await queue.claim({ workerId, workspaceId });
    if (!job) break;
    try {
      const result = await handleJob(
        admin,
        {
          id: job.id,
          jobType: job.jobType,
          workspaceId: job.workspaceId,
          entityType: job.entityType,
          entityId: job.entityId,
          inputSnapshot: job.inputSnapshot,
        },
        env,
      );
      await queue.complete(job.id, result);
      results.push({ jobId: job.id, ok: true });
    } catch (err) {
      if (err instanceof SendDeferredError) {
        await queue.defer(job.id, {
          notBefore: err.defer.notBefore,
          reason: `${err.defer.reason}: ${err.defer.detail}`,
          workerId,
        });
        results.push({
          jobId: job.id,
          ok: true,
          deferred: true,
          error: `DEFERRED:${err.defer.reason}`,
        });
        continue;
      }
      const message = err instanceof Error ? err.message : 'job failed';
      const errorCode =
        err instanceof BlockedTestRecipientError ? 'BLOCKED_TEST_RECIPIENT' : 'JOB_FAILED';
      await queue.fail(job.id, { errorCode, errorDetail: message, workerId });
      results.push({ jobId: job.id, ok: false, error: message });
    }
  }

  return results;
}
