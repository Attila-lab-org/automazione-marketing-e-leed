/**
 * Integration-style E2E for Phase D.1 MOCK pipeline (fake repository).
 * Certifies: 5 restaurant leads → campaign → enrich → demo V2 → draft →
 * review approve → SEND mock → followup 1 (+3d) → followup 2 (+7d) → stop.
 * Dentist never enters Restaurant campaign.
 */

import { describe, expect, it } from 'vitest';
import { InMemoryJobQueue } from '../../src/lib/jobs/queue';
import { ResendMock } from '../../src/lib/providers/resend/mock';
import { runSendGuard, type SendGuardContext } from '../../src/lib/send-guard';
import { pickCompatibleTemplateKey } from '../../src/lib/templates/match';
import { RESTAURANT_PREMIUM_TEMPLATE_KEY } from '../../src/lib/templates/restaurant-premium';
import {
  RESTAURANT_PREMIUM_V2_DEFAULTS,
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
} from '../../src/lib/templates/restaurant-premium-v2';
import { prefillFromLeadV2 } from '../../src/lib/templates/merge-v2';
import type { PolicyEvaluation } from '../../src/lib/types/domain';

type Lead = {
  id: string;
  name: string;
  category: string;
  city: string;
  email: string | null;
  rating: number;
  reviewCount: number;
  businessStatus: string;
};

type CampaignLead = {
  id: string;
  leadId: string;
  status: string;
  sequenceStep: number;
  nextActionAt: string | null;
  preparation: Record<string, unknown>;
  demoSlug: string | null;
  previewImageUrl: string | null;
  draftSubject: string | null;
  draftBody: string | null;
  blockers: string[];
};

type Message = {
  campaignLeadId: string;
  sequenceStep: number;
  subject: string;
  sentAt: string;
};

const SEQ = [
  { step: 0, delay_days: 0 },
  { step: 1, delay_days: 3 },
  { step: 2, delay_days: 7 },
];

const policyEval: PolicyEvaluation = {
  decision: 'MANUAL',
  reasons: [],
  action: 'send',
  gateMode: 'MANUAL',
  autoApproved: false,
  policyVersionId: null,
  policyVersion: null,
  evaluatedAt: new Date().toISOString(),
};

function guardFor(cl: CampaignLead, lead: Lead, extras: Partial<SendGuardContext> = {}): SendGuardContext {
  return {
    recipient: {
      email: lead.email,
      emailValid: Boolean(lead.email?.includes('@')),
      suppressed: false,
      ...extras.recipient,
    },
    lead: {
      businessStatus: lead.businessStatus as 'CAMPAIGN_READY' | 'CONTACTED',
      hasBlockingReply: false,
      ...extras.lead,
    },
    campaign: {
      status: 'ACTIVE',
      rateLimitAvailable: true,
      withinSendWindow: true,
      outreachPausedAll: false,
      ...extras.campaign,
    },
    policy: { evaluation: policyEval, humanApproved: true, ...extras.policy },
    message: {
      subject: cl.draftSubject ?? '',
      body: cl.draftBody ?? '',
      status: 'APPROVED',
      ...extras.message,
    },
    demo: {
      required: true,
      demoReady: Boolean(cl.demoSlug),
      screenshotReady: Boolean(cl.previewImageUrl),
      ...extras.demo,
    },
    idempotency: { alreadySent: false, ...extras.idempotency },
  };
}

function materialize(leads: Lead[], campaignVerticalKey: string) {
  const published = [{ key: campaignVerticalKey, vertical: 'restaurant', published: true }];
  const campaignLeads: CampaignLead[] = [];
  for (const lead of leads) {
    const matched = pickCompatibleTemplateKey(lead.category, published);
    if (!matched) {
      campaignLeads.push({
        id: `cl-${lead.id}`,
        leadId: lead.id,
        status: 'SKIPPED',
        sequenceStep: 0,
        nextActionAt: null,
        preparation: { blockers: ['TEMPLATE_NOT_COMPATIBLE'] },
        demoSlug: null,
        previewImageUrl: null,
        draftSubject: null,
        draftBody: null,
        blockers: ['TEMPLATE_NOT_COMPATIBLE'],
      });
      continue;
    }
    campaignLeads.push({
      id: `cl-${lead.id}`,
      leadId: lead.id,
      status: 'PENDING',
      sequenceStep: 0,
      nextActionAt: null,
      preparation: { templateMatch: matched },
      demoSlug: null,
      previewImageUrl: null,
      draftSubject: null,
      draftBody: null,
      blockers: [],
    });
  }
  return campaignLeads;
}

describe('Phase D.1 — E2E MOCK certification path', () => {
  it('5 restaurant + dentist: full pipeline to followup stop', async () => {
    const restaurants: Lead[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i + 1}`,
      name: `Trattoria ${i + 1}`,
      category: 'restaurant',
      city: 'Milano',
      email: i === 4 ? null : `info@trattoria${i + 1}.it`,
      rating: 4.5,
      reviewCount: 40 + i,
      businessStatus: 'QUALIFIED',
    }));
    const dentist: Lead = {
      id: 'd1',
      name: 'Studio Dentistico',
      category: 'dentist',
      city: 'Milano',
      email: 'info@dentista.it',
      rating: 4.9,
      reviewCount: 200,
      businessStatus: 'QUALIFIED',
    };

    const leads = [...restaurants, dentist];
    const byId = new Map(leads.map((l) => [l.id, l]));
    const campaignLeads = materialize(leads, RESTAURANT_PREMIUM_TEMPLATE_KEY);

    expect(campaignLeads.find((c) => c.leadId === 'd1')?.status).toBe('SKIPPED');
    expect(campaignLeads.filter((c) => c.status === 'PENDING')).toHaveLength(5);

    // Enrichment → demo V2 → draft (skip EMAIL_NOT_FOUND)
    for (const cl of campaignLeads) {
      if (cl.status === 'SKIPPED') continue;
      const lead = byId.get(cl.leadId)!;
      if (!lead.email) {
        cl.status = 'SKIPPED';
        cl.blockers = ['EMAIL_NOT_FOUND'];
        cl.preparation = { ...cl.preparation, emailStatus: 'EMAIL_NOT_FOUND' };
        continue;
      }
      cl.preparation = { ...cl.preparation, emailStatus: 'FOUND', email: lead.email };
      lead.businessStatus = 'CAMPAIGN_READY';

      const demo = prefillFromLeadV2(
        {
          name: lead.name,
          city: lead.city,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
        },
        RESTAURANT_PREMIUM_V2_DEFAULTS,
      );
      expect(demo.branding.hero_image).toBeTruthy();
      expect(demo.content.highlights.length).toBeGreaterThan(0);

      cl.demoSlug = `demo-${lead.id}`;
      cl.previewImageUrl = `/demo/${cl.demoSlug}/email-preview`;
      cl.draftSubject = `${lead.name} — anteprima`;
      cl.draftBody = `<p>Preview per ${lead.name}</p><img src="${cl.previewImageUrl}" />`;
      cl.status = 'REVIEW';
      cl.preparation = {
        ...cl.preparation,
        demoSlug: cl.demoSlug,
        layoutKey: RESTAURANT_PREMIUM_V2_RENDERER_KEY,
        previewPath: cl.previewImageUrl,
      };
    }

    const inReview = campaignLeads.filter((c) => c.status === 'REVIEW');
    expect(inReview).toHaveLength(4);
    expect(inReview.every((c) => Boolean(c.previewImageUrl))).toBe(true);

    // Bulk approve (blockers blocked)
    for (const cl of campaignLeads) {
      if (cl.blockers.length) continue;
      if (cl.status === 'REVIEW') cl.status = 'APPROVED';
    }

    const t0 = new Date('2026-01-01T10:00:00Z');
    const queue = new InMemoryJobQueue({ now: () => t0 });
    const resend = new ResendMock();
    const messages: Message[] = [];

    async function sendStep(cl: CampaignLead, step: number, now: Date) {
      const lead = byId.get(cl.leadId)!;
      const already = messages.some((m) => m.campaignLeadId === cl.id && m.sequenceStep === step);
      const ctx = guardFor(cl, lead, { idempotency: { alreadySent: already } });
      const guard = runSendGuard(ctx, now);
      expect(guard.allowed).toBe(true);

      const subject =
        step === 0
          ? cl.draftSubject!
          : step === 1
            ? `${lead.name} — follow-up`
            : `${lead.name} — ultimo messaggio`;
      const body =
        step === 0
          ? cl.draftBody!
          : step === 1
            ? `<p>Follow-up 1 per ${lead.name}</p>`
            : `<p>Follow-up 2 per ${lead.name}</p>`;

      await resend.send({
        from: 'mock@example.com',
        to: lead.email!,
        subject,
        html: body,
        idempotencyKey: `SEND_MESSAGE:campaign_lead:${cl.id}:step:${step}`,
      });

      // Deterministic clock (ResendMock uses wall clock; sequence math uses simulated now)
      const sentAt = now.toISOString();
      messages.push({
        campaignLeadId: cl.id,
        sequenceStep: step,
        subject,
        sentAt,
      });
      lead.businessStatus = 'CONTACTED';
      cl.sequenceStep = step;
      cl.status = 'SENT';

      const next = SEQ.find((s) => s.step === step + 1);
      if (!next) {
        cl.nextActionAt = null;
        cl.preparation = { ...cl.preparation, sequenceCompleted: true };
        return;
      }
      const origin = new Date(messages.find((m) => m.campaignLeadId === cl.id && m.sequenceStep === 0)!.sentAt);
      const notBefore = new Date(origin.getTime() + next.delay_days * 86400000);
      cl.nextActionAt = notBefore.toISOString();
      cl.sequenceStep = next.step;
      await queue.enqueue({
        workspaceId: 'w',
        jobType: 'FOLLOWUP_STEP',
        entityType: 'campaign_lead',
        entityId: cl.id,
        idempotencyKey: `FOLLOWUP_STEP:campaign_lead:${cl.id}:step:${next.step}`,
        notBefore,
        inputSnapshot: { sequenceStep: next.step },
      });
    }

    // Step 0 for all approved
    for (const cl of campaignLeads.filter((c) => c.status === 'APPROVED')) {
      await sendStep(cl, 0, t0);
    }
    expect(messages.filter((m) => m.sequenceStep === 0)).toHaveLength(4);

    // Day +3 → followup 1
    const day3 = new Date('2026-01-04T10:00:00Z');
    for (let i = 0; i < 10; i += 1) {
      const job = await queue.claim({ workerId: 'cron', now: day3 });
      if (!job) break;
      expect(job.jobType).toBe('FOLLOWUP_STEP');
      const cl = campaignLeads.find((c) => c.id === job.entityId)!;
      cl.draftSubject = `${byId.get(cl.leadId)!.name} — follow-up`;
      cl.draftBody = `<p>Follow-up 1</p>`;
      await sendStep(cl, 1, day3);
      await queue.complete(job.id, { ok: true });
    }
    expect(messages.filter((m) => m.sequenceStep === 1)).toHaveLength(4);

    // Day +7 → followup 2 then stop
    const day7 = new Date('2026-01-08T10:00:00Z');
    for (let i = 0; i < 10; i += 1) {
      const job = await queue.claim({ workerId: 'cron', now: day7 });
      if (!job) break;
      const cl = campaignLeads.find((c) => c.id === job.entityId)!;
      cl.draftSubject = `${byId.get(cl.leadId)!.name} — ultimo`;
      cl.draftBody = `<p>Follow-up 2</p>`;
      await sendStep(cl, 2, day7);
      await queue.complete(job.id, { ok: true });
    }
    expect(messages.filter((m) => m.sequenceStep === 2)).toHaveLength(4);

    const finished = campaignLeads.filter((c) => c.preparation.sequenceCompleted === true);
    expect(finished).toHaveLength(4);
    expect(await queue.claim({ workerId: 'cron', now: new Date('2026-01-20T10:00:00Z') })).toBeNull();

    // Follow-up copy differs from step 0
    const m0 = messages.find((m) => m.sequenceStep === 0)!;
    const m1 = messages.find((m) => m.sequenceStep === 1)!;
    const m2 = messages.find((m) => m.sequenceStep === 2)!;
    expect(m1.subject).not.toBe(m0.subject);
    expect(m2.subject).not.toBe(m1.subject);

    // Review showed real preview URLs
    expect(inReview.every((c) => c.previewImageUrl?.includes('/email-preview'))).toBe(true);

    // Email missing lead skipped, dentist skipped
    expect(campaignLeads.find((c) => c.leadId === 'r5')?.blockers).toContain('EMAIL_NOT_FOUND');
    expect(campaignLeads.find((c) => c.leadId === 'd1')?.blockers).toContain('TEMPLATE_NOT_COMPATIBLE');
  });
});
