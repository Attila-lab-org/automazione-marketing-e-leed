import { describe, expect, it } from 'vitest';
import {
  decideSendRelease,
  describeSendRelease,
  emptySendRelease,
  firstContactAlreadySent,
  reviewBlockers,
  sendSpansMultipleCities,
} from '@/lib/campaigns/review-queue';

describe('sblocco invio dei contatti già approvati', () => {
  it('mette in coda un contatto approvato che ha la bozza e non ha ancora un lavoro', () => {
    expect(decideSendRelease({ hasDraft: true, hasOutbound: false, jobStatus: null })).toBe('queue');
  });

  it('non considera già sbloccato un invio fallito o annullato', () => {
    expect(decideSendRelease({ hasDraft: true, hasOutbound: false, jobStatus: 'FAILED' })).toBe('requeue');
    expect(decideSendRelease({ hasDraft: true, hasOutbound: false, jobStatus: 'CANCELLED' })).toBe('requeue');
  });

  it('non crea un secondo invio se la coda è già aperta o l’email è partita', () => {
    expect(decideSendRelease({ hasDraft: true, hasOutbound: false, jobStatus: 'QUEUED' })).toBe('waiting');
    expect(decideSendRelease({ hasDraft: true, hasOutbound: false, jobStatus: 'RUNNING' })).toBe('waiting');
    expect(decideSendRelease({ hasDraft: true, hasOutbound: true, jobStatus: 'SUCCEEDED' })).toBe('already_sent');
  });

  it('non spedisce senza bozza', () => {
    expect(decideSendRelease({ hasDraft: false, hasOutbound: false, jobStatus: null })).toBe('missing_draft');
  });

  it('non chiama pronto un contatto che ha la demo ma non il testo email', () => {
    expect(
      reviewBlockers({
        deliveryMode: 'PRODUCTION',
        leadEmail: 'cliente@example.com',
        emailStatus: 'FOUND',
        testRecipient: null,
        testRecipientAllowed: false,
        hasDemo: true,
        failed: false,
        hasMessage: false,
      }),
    ).toContain('MESSAGE_NOT_READY');
  });

  it('dice in chiaro se ha messo in coda, se era già in coda, o se non può spedire', () => {
    expect(describeSendRelease({ ...emptySendRelease(), queued: 7 })).toMatch(/7 invii/);
    expect(describeSendRelease({ ...emptySendRelease(), waiting: 7 })).toMatch(/già in coda/);
    expect(describeSendRelease(emptySendRelease())).toMatch(/Nessun contatto pronto/);
  });

  it('non rimanda il primo contatto a chi ha già ricevuto la mail', () => {
    expect(
      firstContactAlreadySent({ step: 0, sameRowSent: false, leadAlreadyGotFirstEmail: true }),
    ).toBe(true);
    expect(
      firstContactAlreadySent({ step: 1, sameRowSent: false, leadAlreadyGotFirstEmail: true }),
    ).toBe(false);
    expect(
      reviewBlockers({
        deliveryMode: 'PRODUCTION',
        leadEmail: 'cliente@example.com',
        emailStatus: 'FOUND',
        testRecipient: null,
        testRecipientAllowed: false,
        hasDemo: true,
        failed: false,
        hasMessage: true,
        alreadyContacted: true,
      }),
    ).toContain('ALREADY_CONTACTED');
  });

  it('blocca un invio che mescola più città finché non se ne sceglie una', () => {
    expect(sendSpansMultipleCities(['Milano', 'Torino'])).toBe(true);
    expect(sendSpansMultipleCities(['Milano', ' milano '])).toBe(false);
    expect(describeSendRelease({ ...emptySendRelease(), needsCity: 2 })).toMatch(/più città/);
  });
});
