import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildWhatsAppUrl,
  extractContactPhone,
  resolveOwnerCtaHref,
} from '../../src/lib/templates/v3-cta';

describe('Owner interesse route — no hardcoded fallbacks', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('missing OWNER_CONTACT_URL → 503 (nessun redirect studio)', async () => {
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.OWNER_WHATSAPP;
    delete process.env.NEXT_PUBLIC_OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(new Request('http://localhost/demo/x/interesse?channel=site'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/OWNER_CONTACT_URL/);
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

  it('missing OWNER_WHATSAPP → nessun hardcoded fallback wa.me', async () => {
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_CONTACT_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(
      new Request('http://localhost/demo/trattoria-duomo/interesse?channel=whatsapp'),
      { params: Promise.resolve({ slug: 'trattoria-duomo' }) },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/OWNER_WHATSAPP/);
    expect(JSON.stringify(body)).not.toMatch(/393462689082/);
    expect(JSON.stringify(body)).not.toMatch(/attila-lab/);
  });

  it('channel=whatsapp con OWNER_WHATSAPP → wa.me + proposta base', async () => {
    process.env.OWNER_WHATSAPP = '3462689082';
    delete process.env.OWNER_OFFER_PRICE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(
      new Request('http://localhost/demo/trattoria-duomo/interesse?channel=whatsapp'),
      { params: Promise.resolve({ slug: 'trattoria-duomo' }) },
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://wa.me/393462689082')).toBe(true);
    expect(decodeURIComponent(loc)).toContain('350 €');
    expect(decodeURIComponent(loc)).toContain('trattoria duomo');
  });

  it('channel=phone usa OWNER_PHONE e apre la chiamata', async () => {
    process.env.OWNER_PHONE = '+39 346 268 9082';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import('../../src/app/demo/[slug]/interesse/route');
    const res = await GET(
      new Request('http://localhost/demo/trattoria-duomo/interesse?channel=phone'),
      { params: Promise.resolve({ slug: 'trattoria-duomo' }) },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('tel:+393462689082');
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
  it('resolveOwnerCtaHref gestisce WhatsApp, telefono e sito', () => {
    expect(resolveOwnerCtaHref({ demoSlug: 'x', channel: 'whatsapp' })).toBe(
      '/demo/x/interesse?channel=whatsapp',
    );
    expect(resolveOwnerCtaHref({ demoSlug: 'x', channel: 'site' })).toBe(
      '/demo/x/interesse?channel=site',
    );
    expect(resolveOwnerCtaHref({ demoSlug: 'x', channel: 'phone' })).toBe(
      '/demo/x/interesse?channel=phone',
    );
    expect(extractContactPhone('https://wa.me/393462689082')).toBe('393462689082');
  });

  it('buildWhatsAppUrl precompila testo senza prezzo di default', () => {
    const url = buildWhatsAppUrl({
      phoneOrUrl: '3462689082',
      businessName: 'Trattoria Duomo',
      slug: 'trattoria-duomo',
    });
    expect(url).toContain('https://wa.me/393462689082');
    expect(decodeURIComponent(url!)).toContain('Trattoria Duomo');
    expect(decodeURIComponent(url!)).not.toMatch(/350/);
  });
});
