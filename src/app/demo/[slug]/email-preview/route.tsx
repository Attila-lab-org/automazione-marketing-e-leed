import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';

export const runtime = 'edge';

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

  const name = data.branding?.business_name ?? 'Attività';
  const headline = data.content?.headline ?? RESTAURANT_PREMIUM_V2_DEFAULTS.content.headline ?? name;
  const sub = data.content?.subheadline ?? RESTAURANT_PREMIUM_V2_DEFAULTS.content.subheadline ?? '';
  const cta = data.content?.cta ?? 'Vedi anteprima completa';
  const accent = data.branding?.accent_color ?? '#d97706';
  const primary = data.branding?.primary_color ?? '#1c1917';
  const city = data.contact?.city ?? '';
  const rating = data.signals?.rating;
  const reviews = data.signals?.review_count;
  const wordmark = name.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: primary,
          color: 'white',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${primary} 0%, #44403c 55%, ${accent} 100%)`,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: 48,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 18, letterSpacing: 6, fontWeight: 700 }}>{wordmark}</div>
            <div
              style={{
                fontSize: 14,
                opacity: 0.7,
                border: '1px solid rgba(255,255,255,0.35)',
                padding: '8px 14px',
                borderRadius: 999,
              }}
            >
              Concept demo
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
            {city ? (
              <div style={{ fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.75 }}>
                {city}
              </div>
            ) : null}
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05 }}>{headline}</div>
            {sub ? <div style={{ fontSize: 24, opacity: 0.85, lineHeight: 1.35 }}>{sub}</div> : null}
            {rating != null && reviews != null ? (
              <div style={{ fontSize: 22, opacity: 0.9 }}>
                ★ {rating.toFixed(1)} · {reviews.toLocaleString('it-IT')} recensioni Google
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 120, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ width: 120, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ width: 120, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.08)' }} />
            </div>
            <div
              style={{
                background: accent,
                color: 'white',
                padding: '18px 32px',
                borderRadius: 999,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {cta}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 800 },
  );
}
