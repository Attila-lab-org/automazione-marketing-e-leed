import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildWhatsAppUrl,
  resolveOwnerCtaHref,
} from '../../src/lib/templates/v3-cta';

describe('Owner interesse route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('senza OWNER_CONTACT_URL usa fallback studio commerciale', async () => {
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.OWNER_WHATSAPP;
    delete process.env.NEXT_PUBLIC_OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/x/interesse?channel=site'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://www.attila-lab.net/')).toBe(true);
    expect(loc).toContain('demo=x');
  });

  it('con OWNER_CONTACT_URL → 302 verso contact + query demo/source', async () => {
    process.env.OWNER_CONTACT_URL = 'https://sales.example/contatto';
    delete process.env.OWNER_WHATSAPP;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/trattoria/interesse?channel=site'), {
      params: Promise.resolve({ slug: 'trattoria' }),
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://sales.example/contatto')).toBe(true);
    expect(loc).toContain('demo=trattoria');
    expect(loc).toContain('source=restaurant-premium-v3-owner-cta');
  });

  it('channel=whatsapp senza env → comunque wa.me (fallback studio)', async () => {
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(
      new Request('http://localhost/demo/trattoria-duomo/interesse?channel=whatsapp'),
      { params: Promise.resolve({ slug: 'trattoria-duomo' }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://wa.me/')).toBe(true);
    expect(loc.includes('attila-lab.net')).toBe(false);
    expect(decodeURIComponent(loc)).toContain('350');
  });

  it('channel=whatsapp con OWNER_WHATSAPP → wa.me + messaggio', async () => {
    process.env.OWNER_WHATSAPP = '393518011635';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(
      new Request('http://localhost/demo/trattoria-duomo/interesse?channel=whatsapp'),
      { params: Promise.resolve({ slug: 'trattoria-duomo' }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://wa.me/393518011635')).toBe(true);
    expect(decodeURIComponent(loc)).toContain('350');
    expect(decodeURIComponent(loc)).toContain('trattoria-duomo');
  });

  it('OWNER_CONTACT_URL non http(s) → 503', async () => {
    process.env.OWNER_CONTACT_URL = 'mailto:sales@example.com';
    delete process.env.OWNER_WHATSAPP;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/x/interesse?channel=site'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(503);
  });
});

describe('Owner CTA helpers', () => {
  it('resolveOwnerCtaHref channel whatsapp/site', () => {
    expect(resolveOwnerCtaHref({ demoSlug: 'x', channel: 'whatsapp' })).toBe(
      '/demo/x/interesse?channel=whatsapp',
    );
    expect(resolveOwnerCtaHref({ demoSlug: 'x', channel: 'site' })).toBe(
      '/demo/x/interesse?channel=site',
    );
  });

  it('buildWhatsAppUrl precompila testo', () => {
    const url = buildWhatsAppUrl({
      phoneOrUrl: '+39 351 801 1635',
      businessName: 'Trattoria Duomo',
      slug: 'trattoria-duomo',
    });
    expect(url).toContain('https://wa.me/393518011635');
    expect(decodeURIComponent(url!)).toContain('Trattoria Duomo');
  });
});
