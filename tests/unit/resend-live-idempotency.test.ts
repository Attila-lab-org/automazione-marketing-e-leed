import { describe, expect, it, vi } from 'vitest';
import { ResendLive } from '../../src/lib/providers/resend/live';

describe('ResendLive idempotency (P0.8)', () => {
  it('passes idempotencyKey as SDK send options, not email headers', async () => {
    const live = new ResendLive({ apiKey: 're_test_key' });
    const sendSpy = vi.fn().mockResolvedValue({
      data: { id: 'msg_provider_1' },
      error: null,
    });
    (live._clientForTests.emails as unknown as { send: typeof sendSpy }).send = sendSpy;

    await live.send({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      headers: { 'X-Custom': 'keep-me' },
      idempotencyKey: 'SEND_MESSAGE:campaign_lead:abc:step:0',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [payload, options] = sendSpy.mock.calls[0];
    expect(options).toEqual({
      idempotencyKey: 'SEND_MESSAGE:campaign_lead:abc:step:0',
    });
    expect(payload.headers).toEqual({ 'X-Custom': 'keep-me' });
    expect(payload.headers?.['Idempotency-Key']).toBeUndefined();
  });

  it('omits send options when no idempotencyKey', async () => {
    const live = new ResendLive({ apiKey: 're_test_key' });
    const sendSpy = vi.fn().mockResolvedValue({
      data: { id: 'msg_2' },
      error: null,
    });
    (live._clientForTests.emails as unknown as { send: typeof sendSpy }).send = sendSpy;

    await live.send({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][1]).toBeUndefined();
  });
});
