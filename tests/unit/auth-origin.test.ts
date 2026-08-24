import { describe, expect, it } from 'vitest';
import { collectAllowedMutationHosts } from '@/lib/auth/guard';

describe('collectAllowedMutationHosts', () => {
  it('include Host, APP_URL e VERCEL_URL', () => {
    const hosts = collectAllowedMutationHosts(
      {
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'https://outreach.attila-lab.com',
        VERCEL_URL: 'automazione-marketing-e-leed-o1wt.vercel.app',
      } as NodeJS.ProcessEnv,
      'outreach.attila-lab.com',
    );
    expect(hosts.has('outreach.attila-lab.com')).toBe(true);
    expect(hosts.has('automazione-marketing-e-leed-o1wt.vercel.app')).toBe(true);
  });
});
