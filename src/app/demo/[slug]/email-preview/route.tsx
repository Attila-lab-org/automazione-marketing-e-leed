import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

export const runtime = 'edge';

/** Formato email-safe: piccolo, senza foto remote (PNG ~1.5MB faceva fallire Gmail). */
const EMAIL_OG = { width: 600, height: 360 } as const;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
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

  const isV3 = demo.rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY;
  const data = demo.data as {
    branding?: {
      business_name?: string | null;
      accent_color?: string | null;
      primary_color?: string | null;
    };
    content?: {
      headline?: string | null;
      subheadline?: string | null;
      cta?: string | null;
    };
    signals?: { rating?: number | null; review_count?: number | null };
    contact?: { city?: string | null };
  };

  const name = truncate(data.branding?.business_name?.trim() || 'Attività', 42);
  const headline = truncate(
    data.content?.headline?.trim() ||
      (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline : RESTAURANT_PREMIUM_V2_DEFAULTS.content.headline) ||
      name,
    72,
  );
  const cta =
    data.content?.cta?.trim() ||
    (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta : 'Prenota un tavolo');
  const accent = data.branding?.accent_color || (isV3 ? '#b86a45' : '#d97706');
  const primary = data.branding?.primary_color || (isV3 ? '#2c241e' : '#1c1917');
  const city = data.contact?.city?.trim() || '';
  const rating = data.signals?.rating;
  const reviews = data.signals?.review_count;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(145deg, ${primary} 0%, #3d2f28 48%, ${accent} 140%)`,
          color: '#fffdf9',
          fontFamily: 'Georgia, serif',
          padding: '28px 32px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
              opacity: 0.75,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Anteprima personalizzata
          </div>
          {city ? (
            <div
              style={{
                display: 'flex',
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                opacity: 0.7,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {truncate(city, 28)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 540 }}>
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 28 ? 28 : 34,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: 0.2,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              lineHeight: 1.35,
              opacity: 0.92,
              maxWidth: 520,
            }}
          >
            {headline}
          </div>
          {rating != null ? (
            <div
              style={{
                display: 'flex',
                fontSize: 13,
                opacity: 0.85,
                fontFamily: 'system-ui, sans-serif',
                marginTop: 4,
              }}
            >
              {Number(rating).toFixed(1)}
              {reviews != null
                ? ` · ${Number(reviews).toLocaleString('it-IT')} recensioni Google`
                : ' su Google'}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              background: accent,
              color: '#fffdf9',
              padding: '12px 20px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {truncate(cta, 28)}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 11,
              opacity: 0.65,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Concept demo
          </div>
        </div>
      </div>
    ),
    {
      ...EMAIL_OG,
      headers: CACHE_HEADERS,
    },
  );
}
