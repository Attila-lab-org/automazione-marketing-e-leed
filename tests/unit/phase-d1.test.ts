import { describe, expect, it } from 'vitest';
import { isAdminEmailAllowed } from '../../src/lib/auth/authenticate';
import { mergePreparation } from '../../src/lib/campaigns/preparation';
import { assertSafePublicUrl } from '../../src/lib/enrichment/email-from-website';
import { isPublicApi } from '../../src/lib/auth/constants';
import { InMemoryJobQueue } from '../../src/lib/jobs/queue';
import { needsGooglePlaceDetails } from '../../src/lib/leads/google-enrich';
import { runSendGuard, type SendGuardContext } from '../../src/lib/send-guard';
import { pickCompatibleTemplateKey } from '../../src/lib/templates/match';
import { RESTAURANT_PREMIUM_TEMPLATE_KEY } from '../../src/lib/templates/restaurant-premium';
import {
  RESTAURANT_PREMIUM_V2_DEFAULTS,
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
} from '../../src/lib/templates/restaurant-premium-v2';
import { prefillFromLeadV2 } from '../../src/lib/templates/merge-v2';
import type { PolicyEvaluation } from '../../src/lib/types/domain';

const envAllow = { NODE_ENV: 'test', ADMIN_EMAIL: 'attiliomazzetti@gmail.com' } as NodeJS.ProcessEnv;

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

function baseGuard(overrides: Partial<SendGuardContext> = {}): SendGuardContext {
  return {
    recipient: { email: 'a@b.it', emailValid: true, suppressed: false },
    lead: { businessStatus: 'CAMPAIGN_READY', hasBlockingReply: false },
    campaign: {
      status: 'ACTIVE',
      rateLimitAvailable: true,
      withinSendWindow: true,
      outreachPausedAll: false,
    },
    policy: { evaluation: policyEval, humanApproved: true },
    message: { subject: 'x', body: 'y', status: 'APPROVED' },
    demo: { required: true, demoReady: true, screenshotReady: true },
    idempotency: { alreadySent: false },
    ...overrides,
  };
}

describe('Phase D.1 — template compatibility', () => {
  it('dentist non riceve Restaurant Premium', () => {
    expect(
      pickCompatibleTemplateKey('dentist', [
        { key: RESTAURANT_PREMIUM_TEMPLATE_KEY, vertical: 'restaurant', published: true },
      ]),
    ).toBeNull();
  });
});

describe('Phase D.1 — V2 full page with sparse lead', () => {
  it('demo con soli nome/città/rating resta completa via defaults', () => {
    const data = prefillFromLeadV2(
      { name: 'Trattoria X', city: 'Milano', rating: 4.6, reviewCount: 88 },
      RESTAURANT_PREMIUM_V2_DEFAULTS,
    );
    expect(data.branding.business_name).toBe('Trattoria X');
    expect(data.content.headline).toBeTruthy();
    expect(data.content.highlights.length).toBeGreaterThan(0);
    expect(data.branding.hero_image).toBeTruthy();
    expect(data.branding.gallery.length).toBeGreaterThan(0);
    expect(data.signals.rating).toBe(4.6);
  });

  it('editor V2 usa renderer key restaurant-premium-v2', () => {
    expect(RESTAURANT_PREMIUM_V2_RENDERER_KEY).toBe('restaurant-premium-v2');
  });
});

describe('Phase D.1 — enrichment SSRF', () => {
  it('blocca localhost e private IP', () => {
    expect(() => assertSafePublicUrl('http://localhost/admin')).toThrow(/BLOCKED/);
    expect(() => assertSafePublicUrl('http://127.0.0.1/')).toThrow(/BLOCKED/);
    expect(() => assertSafePublicUrl('http://192.168.1.10/')).toThrow(/BLOCKED/);
    expect(() => assertSafePublicUrl('http://169.254.169.254/latest')).toThrow(/BLOCKED/);
  });

  it('consente https pubblico', () => {
    expect(assertSafePublicUrl('https://ristorante-example.it/contatti').hostname).toBe(
      'ristorante-example.it',
    );
  });
});

describe('Phase D.1 — auth allowlist', () => {
  it('normale utente fuori allowlist → denied', () => {
    expect(isAdminEmailAllowed('random@gmail.com', envAllow)).toBe(false);
    expect(isAdminEmailAllowed('attiliomazzetti@gmail.com', envAllow)).toBe(true);
  });
});

describe('Phase D.1 — preparation merge', () => {
  it('non perde chiavi precedenti', () => {
    const merged = mergePreparation({ emailStatus: 'FOUND' }, { demoSlug: 'x' });
    expect(merged.emailStatus).toBe('FOUND');
    expect(merged.demoSlug).toBe('x');
  });
});

describe('Phase D.1 — google enrich gating', () => {
  it('non richiede Place Details se phone+website presenti', () => {
    expect(
      needsGooglePlaceDetails({
        phone: '02',
        website_url: 'https://x.it',
      } as never),
    ).toBe(false);
    expect(
      needsGooglePlaceDetails({
        phone: null,
        website_url: 'https://x.it',
      } as never),
    ).toBe(true);
  });
});

describe('Phase D.1 — sequence scheduling + send guard real flags', () => {
  it('FOLLOWUP notBefore rispetta queue in-memory', async () => {
    const q = new InMemoryJobQueue({ now: () => new Date('2026-01-01T10:00:00Z') });
    await q.enqueue({
      workspaceId: 'w',
      jobType: 'FOLLOWUP_STEP',
      entityType: 'campaign_lead',
      entityId: 'cl1',
      idempotencyKey: 'FOLLOWUP_STEP:campaign_lead:cl1:step:1',
      notBefore: new Date('2026-01-04T10:00:00Z'),
    });
    const early = await q.claim({
      workerId: 'w1',
      now: new Date('2026-01-02T10:00:00Z'),
    });
    expect(early).toBeNull();
    const later = await q.claim({
      workerId: 'w1',
      now: new Date('2026-01-05T10:00:00Z'),
    });
    expect(later?.jobType).toBe('FOLLOWUP_STEP');
  });

  it('suppression / reply / rate / pause / alreadySent / send window bloccano', () => {
    expect(runSendGuard(baseGuard({ recipient: { email: 'a@b.it', emailValid: true, suppressed: true } })).allowed).toBe(
      false,
    );
    expect(
      runSendGuard(baseGuard({ lead: { businessStatus: 'CAMPAIGN_READY', hasBlockingReply: true } })).allowed,
    ).toBe(false);
    expect(
      runSendGuard(
        baseGuard({
          campaign: {
            status: 'ACTIVE',
            rateLimitAvailable: false,
            withinSendWindow: true,
            outreachPausedAll: false,
          },
        }),
      ).allowed,
    ).toBe(false);
    expect(
      runSendGuard(
        baseGuard({
          campaign: {
            status: 'ACTIVE',
            rateLimitAvailable: true,
            withinSendWindow: false,
            outreachPausedAll: false,
          },
        }),
      ).allowed,
    ).toBe(false);
    expect(
      runSendGuard(
        baseGuard({
          campaign: {
            status: 'ACTIVE',
            rateLimitAvailable: true,
            withinSendWindow: true,
            outreachPausedAll: true,
          },
        }),
      ).allowed,
    ).toBe(false);
    expect(runSendGuard(baseGuard({ idempotency: { alreadySent: true } })).allowed).toBe(false);
    expect(
      runSendGuard(
        baseGuard({
          campaign: {
            status: 'PAUSED',
            rateLimitAvailable: true,
            withinSendWindow: true,
            outreachPausedAll: false,
          },
        }),
      ).allowed,
    ).toBe(false);
  });
});

describe('Phase D.1 — cron surface', () => {
  it('api cron è pubblica (system auth, no admin cookie)', () => {
    expect(isPublicApi('/api/cron/jobs')).toBe(true);
  });
});
