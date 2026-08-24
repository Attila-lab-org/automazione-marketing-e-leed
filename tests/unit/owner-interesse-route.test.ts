import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Owner interesse route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('senza OWNER_CONTACT_URL → 503', async () => {
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/x/interesse'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(503);
  });

  it('con OWNER_CONTACT_URL → 302 verso contact + query demo/source', async () => {
    process.env.OWNER_CONTACT_URL = 'https://sales.example/contatto';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/trattoria/interesse'), {
      params: Promise.resolve({ slug: 'trattoria' }),
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://sales.example/contatto')).toBe(true);
    expect(loc).toContain('demo=trattoria');
    expect(loc).toContain('source=restaurant-premium-v3-owner-cta');
  });

  it('OWNER_CONTACT_URL non http(s) → 503', async () => {
    process.env.OWNER_CONTACT_URL = 'mailto:sales@example.com';
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/x/interesse'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(503);
  });
});
