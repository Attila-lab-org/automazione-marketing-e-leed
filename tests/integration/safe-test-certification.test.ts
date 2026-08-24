import { describe, expect, it, vi } from 'vitest';
import {
  BlockedTestRecipientError,
  resolveTestDelivery,
} from '../../src/lib/campaigns/test-delivery';
import { listReviewQueue } from '../../src/lib/campaigns/review-queue';
import { runSendGuard, type SendGuardContext } from '../../src/lib/send-guard';
import type { PolicyEvaluation } from '../../src/lib/types/domain';

const allowEnv = {
  RESEND_TEST_RECIPIENT_ALLOWLIST: 'test@example.com',
} as unknown as NodeJS.ProcessEnv;

function autoEval(): PolicyEvaluation {
  return {
    action: 'send',
    gateMode: 'MANUAL',
    decision: 'MANUAL',
    autoApproved: false,
    reasons: [],
    policyVersionId: 'pv-1',
    policyVersion: 1,
    evaluatedAt: new Date().toISOString(),
  };
}

describe('TEST mode without prospect email (P0.7)', () => {
  it('resolveTestDelivery: intended null, actual = allowlisted test recipient', () => {
    const r = resolveTestDelivery({
      deliveryMode: 'TEST',
      testRecipient: 'test@example.com',
      leadEmail: null,
      env: allowEnv,
    });
    expect(r.intendedRecipient).toBeNull();
    expect(r.actualDeliveryRecipient).toBe('test@example.com');
  });

  it('PRODUCTION still requires lead email', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'PRODUCTION',
        testRecipient: null,
        leadEmail: null,
        env: allowEnv,
      }),
    ).toThrow(/mancante/);
  });

  it('Send Guard: TEST effective recipient passes without lead email', () => {
    const ctx: SendGuardContext = {
      recipient: {
        email: 'test@example.com',
        emailValid: true,
        suppressed: false,
      },
      lead: { businessStatus: 'CAMPAIGN_READY', hasBlockingReply: false },
      campaign: { status: 'ACTIVE', rateLimitAvailable: true, outreachPausedAll: false },
      policy: { evaluation: autoEval(), humanApproved: true },
      message: { subject: 'Ciao', body: 'Body', status: 'APPROVED' },
      demo: { required: true, demoReady: true, screenshotReady: true },
      idempotency: { alreadySent: false },
    };
    expect(runSendGuard(ctx).allowed).toBe(true);
  });

  it('non-allowlisted test recipient → BlockedTestRecipientError (zero provider)', () => {
    expect(() =>
      resolveTestDelivery({
        deliveryMode: 'TEST',
        testRecipient: 'evil@hacker.com',
        leadEmail: null,
        env: allowEnv,
      }),
    ).toThrow(BlockedTestRecipientError);
  });
});

describe('Review Queue real query contract (P0.3 / P0.11)', () => {
  it('selects discovery_confidence (not confidence) and surfaces lead fields', async () => {
    const selectCalls: string[] = [];
    const leadsSelect = vi.fn().mockImplementation((cols: string) => {
      selectCalls.push(cols);
      return {
        in: () =>
          Promise.resolve({
            data: [
              {
                id: 'lead-1',
                name: 'Ristorante Example',
                category: 'restaurant',
                city: 'Roma',
                email: null,
                discovery_score: 72,
                discovery_confidence: 0.81,
              },
            ],
            error: null,
          }),
      };
    });

    const admin = {
      from: (table: string) => {
        if (table === 'campaign_leads') {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: 'cl-1',
                            campaign_id: 'camp-1',
                            status: 'REVIEW',
                            lead_id: 'lead-1',
                            demo_site_id: 'demo-1',
                            sequence_step: 0,
                            preparation: { emailStatus: 'EMAIL_NOT_FOUND' },
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'leads') {
          return { select: leadsSelect };
        }
        if (table === 'demo_sites') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ id: 'demo-1', slug: 'ristorante-example', public_url: null }],
                  error: null,
                }),
            }),
          };
        }
        if (table === 'message_drafts') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      campaign_lead_id: 'cl-1',
                      subject: 'Ciao',
                      body: '<p>Body</p>',
                      sequence_step: 0,
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        if (table === 'campaigns') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'camp-1',
                      delivery_mode: 'TEST',
                      test_recipient: 'test@example.com',
                      name: 'Campagna TEST',
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const items = await listReviewQueue(
      admin as never,
      'ws-1',
      'https://app.example.com',
    );

    expect(leadsSelect).toHaveBeenCalled();
    const cols = selectCalls.join(' ');
    expect(cols).toContain('discovery_confidence');
    expect(cols).not.toMatch(/(^|[, ])confidence([, ]|$)/);

    expect(items).toHaveLength(1);
    expect(items[0].companyName).toBe('Ristorante Example');
    expect(items[0].score).toBe(72);
    expect(items[0].confidence).toBe(0.81);
    expect(items[0].email).toBeNull();
    expect(items[0].deliveryMode).toBe('TEST');
    expect(items[0].blockers).not.toContain('EMAIL_NOT_FOUND');
    expect(items[0].blockers).not.toContain('TEST_RECIPIENT_MISSING');
  });

  it('throws on leads query error instead of Lead sconosciuto', async () => {
    const admin = {
      from: (table: string) => {
        if (table === 'campaign_leads') {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: 'cl-1',
                            campaign_id: 'c1',
                            status: 'REVIEW',
                            lead_id: 'lead-1',
                            demo_site_id: null,
                            sequence_step: 0,
                            preparation: {},
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'leads') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'column leads.confidence does not exist' },
                }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    };

    await expect(listReviewQueue(admin as never, 'ws-1', 'https://app.example.com')).rejects.toThrow(
      /Review queue leads/,
    );
  });
});
