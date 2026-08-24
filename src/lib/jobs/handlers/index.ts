import type { SupabaseClient } from '@supabase/supabase-js';
import { createDemoFromLead } from '@/lib/demos/create';
import { enrichLeadEmail } from '@/lib/enrichment/enrich-lead-email';
import { enrichLeadFromGoogle } from '@/lib/leads/google-enrich';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import { RESTAURANT_PREMIUM_V2_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v2';
import { buildVisualEmailDraft } from '@/lib/messaging/visual-email';
import { getOutreachPausedAll } from '@/lib/settings/outreach-pause';
import { runSendGuard, type SendGuardContext } from '@/lib/send-guard';
import { getResendProvider } from '@/lib/providers/resend';

export async function handleJob(
  admin: SupabaseClient,
  job: { id: string; jobType: string; workspaceId: string; entityType: string; entityId: string; inputSnapshot: Record<string, unknown> },
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  switch (job.jobType) {
    case 'LEAD_ENRICHMENT':
      return handleLeadEnrichment(admin, job);
    case 'DEMO_GENERATION':
      return handleDemoGeneration(admin, job);
    case 'MESSAGE_GENERATION':
      return handleMessageGeneration(admin, job, env);
    case 'SEND_MESSAGE':
      return handleSendMessage(admin, job, env);
    default:
      return { skipped: true, reason: `Unsupported job type ${job.jobType}` };
  }
}

async function handleLeadEnrichment(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
) {
  const leadId = String(job.inputSnapshot.leadId ?? '');
  await enrichLeadFromGoogle(admin, job.workspaceId, leadId);
  const email = await enrichLeadEmail(admin, job.workspaceId, leadId);

  await admin
    .from('campaign_leads')
    .update({
      status: email.email ? 'GENERATING' : 'FAILED',
      preparation: {
        emailStatus: email.status,
        enrichedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.entityId);

  const queue = new SupabaseJobQueue(admin);
  if (email.email) {
    await queue.enqueue({
      workspaceId: job.workspaceId,
      jobType: 'DEMO_GENERATION',
      entityType: 'campaign_lead',
      entityId: job.entityId,
      idempotencyKey: `DEMO_GENERATION:campaign_lead:${job.entityId}`,
      inputSnapshot: { leadId, layoutKey: RESTAURANT_PREMIUM_V2_RENDERER_KEY },
      priority: 60,
    });
  }

  return { emailStatus: email.status };
}

async function handleDemoGeneration(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
) {
  const leadId = String(job.inputSnapshot.leadId ?? '');
  const layoutKey = String(job.inputSnapshot.layoutKey ?? RESTAURANT_PREMIUM_V2_RENDERER_KEY);
  const demo = await createDemoFromLead(admin, job.workspaceId, {
    leadId,
    layoutKey,
  });

  await admin
    .from('campaign_leads')
    .update({
      demo_site_id: demo.id,
      status: 'READY',
      preparation: {
        demoSlug: demo.slug,
        publicPath: demo.publicPath,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.entityId);

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
  const draft = await buildVisualEmailDraft(admin, job.workspaceId, job.entityId, env);
  await admin
    .from('campaign_leads')
    .update({ status: 'REVIEW', updated_at: new Date().toISOString() })
    .eq('id', job.entityId);
  return { draftId: draft.draftId, subject: draft.subject };
}

async function handleSendMessage(
  admin: SupabaseClient,
  job: { workspaceId: string; entityId: string; inputSnapshot: Record<string, unknown> },
  env: NodeJS.ProcessEnv,
) {
  const sequenceStep = Number(job.inputSnapshot.sequenceStep ?? 0);
  const paused = await getOutreachPausedAll(admin, job.workspaceId);
  if (paused) throw new Error('OUTREACH_PAUSED');

  const { data: cl, error: clError } = await admin
    .from('campaign_leads')
    .select('id, lead_id, demo_site_id, status, campaign_id, sequence_step')
    .eq('id', job.entityId)
    .single();
  if (clError || !cl) throw new Error(`Send: campaign_lead non trovato — ${clError?.message ?? ''}`);

  const [{ data: lead }, { data: campaign }, { data: draft }] = await Promise.all([
    admin.from('leads').select('email, business_status').eq('id', cl.lead_id).single(),
    admin.from('campaigns').select('status').eq('id', cl.campaign_id).single(),
    admin
      .from('message_drafts')
      .select('subject, body, status')
      .eq('campaign_lead_id', cl.id)
      .eq('sequence_step', sequenceStep)
      .maybeSingle(),
  ]);

  const ctx: SendGuardContext = {
    recipient: { email: lead?.email ?? null, emailValid: Boolean(lead?.email), suppressed: false },
    lead: { businessStatus: lead?.business_status ?? 'NEW', hasBlockingReply: false },
    campaign: {
      status: campaign?.status ?? 'PAUSED',
      rateLimitAvailable: true,
      outreachPausedAll: paused,
    },
    policy: { evaluation: null, humanApproved: cl.status === 'APPROVED' },
    message: {
      subject: draft?.subject ?? '',
      body: draft?.body ?? '',
      status: draft?.status === 'READY' || draft?.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
    },
    demo: { required: true, demoReady: Boolean(cl.demo_site_id), screenshotReady: true },
    idempotency: { alreadySent: false },
  };

  const guard = runSendGuard(ctx);
  if (!guard.allowed) throw new Error(guard.blockers.join('; '));

  const resend = getResendProvider(env);
  if (env.RESEND_PROVIDER_MODE?.toLowerCase() === 'live') {
    throw new Error('Invio live disabilitato finché non autorizzato esplicitamente');
  }

  await resend.send({
    from: env.RESEND_FROM ?? 'onboarding@resend.dev',
    to: lead!.email!,
    subject: draft!.subject!,
    html: draft!.body!,
    idempotencyKey: `SEND_MESSAGE:campaign_lead:${cl.id}:step:${sequenceStep}`,
  });

  return { mocked: true, sequenceStep, provider: env.RESEND_PROVIDER_MODE ?? 'mock' };
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
  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];

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
      const message = err instanceof Error ? err.message : 'job failed';
      await queue.fail(job.id, { errorCode: 'JOB_FAILED', errorDetail: message, workerId });
      results.push({ jobId: job.id, ok: false, error: message });
    }
  }

  return results;
}
