import { describe, expect, it } from 'vitest';
import { demoExpiresAt, isDemoExpired } from '@/lib/demos/retention';
import {
  buildUnsubscribeUrls,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/suppression/unsubscribe-token';
import { appendEmailComplianceFooter } from '@/lib/suppression/email-compliance';

const ENV = {
  UNSUBSCRIBE_SECRET: 'test-secret-with-enough-entropy',
  NEXT_PUBLIC_APP_URL: 'https://example.test',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

describe('retention demo', () => {
  it('imposta la scadenza esattamente 36 ore dopo la creazione', () => {
    const created = new Date('2026-09-02T10:00:00.000Z');
    expect(demoExpiresAt(created)).toBe('2026-09-03T22:00:00.000Z');
    expect(isDemoExpired(demoExpiresAt(created), new Date('2026-09-03T21:59:59.999Z'))).toBe(false);
    expect(isDemoExpired(demoExpiresAt(created), new Date('2026-09-03T22:00:00.000Z'))).toBe(true);
  });
});

describe('disiscrizione', () => {
  it('firma e verifica senza esporre email nel link', () => {
    const token = createUnsubscribeToken('workspace-1', 'lead-1', ENV);
    expect(token).not.toContain('@');
    expect(verifyUnsubscribeToken(token, ENV)).toEqual({
      v: 1,
      workspaceId: 'workspace-1',
      leadId: 'lead-1',
    });
    expect(verifyUnsubscribeToken(`${token}x`, ENV)).toBeNull();
  });

  it('produce link one-click e aggiunge una sola informativa alla mail', () => {
    const urls = buildUnsubscribeUrls('workspace-1', 'lead-1', ENV);
    expect(urls.pageUrl).toMatch(/^https:\/\/example\.test\/unsubscribe\?token=/);
    expect(urls.oneClickUrl).toMatch(/^https:\/\/example\.test\/api\/unsubscribe\?token=/);

    const once = appendEmailComplianceFooter('<p>Ciao</p>', 'workspace-1', 'lead-1', ENV);
    const twice = appendEmailComplianceFooter(once, 'workspace-1', 'lead-1', ENV);
    expect(once).toContain('Non voglio ricevere altre email');
    expect(once).toContain('dopo 36 ore');
    expect(twice).toBe(once);
  });
});
