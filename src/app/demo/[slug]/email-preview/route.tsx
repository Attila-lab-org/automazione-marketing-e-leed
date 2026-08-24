import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';

export const runtime = 'edge';

/** ImageResponse can load https(s) images; data: / relative → use CSS hero fallback. */
function heroSrcForOg(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  if (v.startsWith('https://') || v.startsWith('http://')) return v;
  return null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Not configured', { status: 503 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const demo = await loadDemoBySlug(admin, slug);
  if (!demo) return new Response('Not found', { status: 404 });

  const data = demo.data as {
    branding?: {
      business_name?: string | null;
      accent_color?: string | null;
      primary_color?: string | null;
      hero_image?: string | null;
      logo_url?: string | null;
    };
    content?: {
      headline?: string | null;
      subheadline?: string | null;
      cta?: string | null;
    };
    signals?: { rating?: number | null; review_count?: number | null };
    contact?: { city?: string | null };
  };

  const defaults = RESTAURANT_PREMIUM_V2_DEFAULTS;
  const name = data.branding?.business_name?.trim() || 'Attività';
  const headline = data.content?.headline?.trim() || defaults.content.headline || name;
  const sub = data.content?.subheadline?.trim() || defaults.content.subheadline || '';
  const cta = data.content?.cta?.trim() || defaults.content.cta || 'Prenota un tavolo';
  const accent = data.branding?.accent_color || defaults.branding.accent_color || '#d97706';
  const primary = data.branding?.primary_color || defaults.branding.primary_color || '#1c1917';
  const city = data.contact?.city?.trim() || '';
  const rating = data.signals?.rating;
  const reviews = data.signals?.review_count;
  const wordmark = name.toUpperCase();
  const logoUrl = heroSrcForOg(data.branding?.logo_url);
  const heroUrl =
    heroSrcForOg(data.branding?.hero_image) ??
    heroSrcForOg(defaults.branding.hero_image);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafaf9',
          color: primary,
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Navbar / wordmark — first viewport of Restaurant Premium V2 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 40px',
            borderBottom: '1px solid #e7e5e4',
            background: 'rgba(255,255,255,0.92)',
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} width={140} height={36} style={{ objectFit: 'contain' }} alt="" />
          ) : (
            <div style={{ fontSize: 14, letterSpacing: 6, fontWeight: 700 }}>{wordmark}</div>
          )}
          <div style={{ display: 'flex', gap: 28, fontSize: 16, color: '#78716c' }}>
            <span>Esperienza</span>
            <span>Ambiente</span>
            <span>Contatti</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: accent }}>{cta}</div>
        </div>

        {/* Hero = first viewport */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flex: 1,
            overflow: 'hidden',
            background: primary,
          }}
        >
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              width={1200}
              height={620}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.72,
              }}
              alt=""
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, ${primary} 0%, #44403c 55%, ${accent} 100%)`,
                display: 'flex',
              }}
            />
          )}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '48px 48px 40px',
              width: '100%',
              color: 'white',
            }}
          >
            {city ? (
              <div style={{ fontSize: 18, letterSpacing: 5, textTransform: 'uppercase', opacity: 0.75 }}>
                {city}
              </div>
            ) : null}
            <div style={{ fontSize: 22, opacity: 0.85, marginTop: 8 }}>{name}</div>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, marginTop: 10, maxWidth: 900 }}>
              {headline}
            </div>
            {sub ? (
              <div style={{ fontSize: 22, opacity: 0.88, lineHeight: 1.35, marginTop: 14, maxWidth: 820 }}>
                {sub}
              </div>
            ) : null}
            {rating != null ? (
              <div style={{ fontSize: 20, marginTop: 18, opacity: 0.95 }}>
                ★ {Number(rating).toFixed(1)}
                {reviews != null ? ` · ${Number(reviews).toLocaleString('it-IT')} recensioni Google` : ''}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  background: accent,
                  color: 'white',
                  padding: '16px 28px',
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {cta}
              </div>
              {/* Accenno struttura pagina successiva */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 100, height: 58, borderRadius: 10, background: 'rgba(255,255,255,0.18)' }} />
                <div style={{ width: 100, height: 58, borderRadius: 10, background: 'rgba(255,255,255,0.12)' }} />
                <div style={{ width: 100, height: 58, borderRadius: 10, background: 'rgba(255,255,255,0.08)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 800 },
  );
}
