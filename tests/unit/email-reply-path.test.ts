import { describe, expect, it } from 'vitest';
import {
  getEmailReplyPathReadiness,
  requireEmailReplyPath,
} from '../../src/lib/inbound/email-readiness';
import { normalizeResendInboundPayload } from '../../src/lib/inbound/email';

describe('email reply path readiness', () => {
  it('non considera il mittente una mailbox inbound', () => {
    const env = {
      ...process.env,
      RESEND_FROM: 'Attila <noreply@outreach.attila-lab.net>',
    };
    const readiness = getEmailReplyPathReadiness(env);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('RESEND_REPLY_TO');
    expect(() => requireEmailReplyPath(env)).toThrow(/Invio live bloccato/);
  });

  it('accetta solo un Reply-To esplicito sul dominio inbound attivo', () => {
    const env = {
      ...process.env,
      RESEND_REPLY_TO: 'replies@outreach.attila-lab.net',
      RESEND_INBOUND_DOMAIN: 'outreach.attila-lab.net',
      RESEND_INBOUND_ENABLED: 'true',
    };
    expect(getEmailReplyPathReadiness(env)).toMatchObject({
      ready: true,
      replyTo: 'replies@outreach.attila-lab.net',
    });
    expect(requireEmailReplyPath(env)).toBe('replies@outreach.attila-lab.net');
  });
});

describe('Resend received email normalization', () => {
  it('trasforma il contenuto recuperato in una risposta commerciale', () => {
    const inbound = normalizeResendInboundPayload({
      type: 'email.received',
      created_at: '2026-08-26T01:00:00.000Z',
      data: {
        email_id: 'received-1',
        from: 'prospect@example.com',
        to: ['replies@outreach.attila-lab.net'],
        subject: 'Re: proposta',
        text: 'Ok mi interessa',
        message_id: '<reply-1@example.com>',
        headers: {},
      },
    });
    expect(inbound).toMatchObject({
      kind: 'reply',
      from: 'prospect@example.com',
      text: 'Ok mi interessa',
      providerMessageId: 'received-1',
      messageHeaderId: '<reply-1@example.com>',
    });
  });
});
