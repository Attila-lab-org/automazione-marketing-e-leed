import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

export const runtime = 'edge';

/** 600×340 — proporzione email, senza overflow Satori. */
const W = 600;
const H = 340;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
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
      cta?: string | null;
    };
    signals?: { rating?: number | null; review_count?: number | null };
    contact?: { city?: string | null };
  };

  const name = truncate(data.branding?.business_name?.trim() || 'Attività', 36);
  const headline = truncate(
    data.content?.headline?.trim() ||
      (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline : RESTAURANT_PREMIUM_V2_DEFAULTS.content.headline) ||
      name,
    64,
  );
  const cta = truncate(
    data.content?.cta?.trim() ||
      (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta : 'Prenota un tavolo'),
    22,
  );
  const accent = data.branding?.accent_color || (isV3 ? '#b86a45' : '#d97706');
  const primary = data.branding?.primary_color || (isV3 ? '#2c241e' : '#1c1917');
  const city = truncate(data.contact?.city?.trim() || '', 24);
  const rating = data.signals?.rating;
  const reviews = data.signals?.review_count;
  const nameSize = name.length > 24 ? 26 : name.length > 16 ? 30 : 34;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          background: '#ebe4da',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Chrome browser finto — comunica “anteprima sito” */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            paddingLeft: 14,
            paddingRight: 14,
            background: '#f7f3ee',
            borderBottom: '1px solid #d9d0c4',
          }}
        >
          <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: '#e8a0a0' }} />
          <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: '#e8d08a' }} />
          <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: '#a8d4a0' }} />
          <div
            style={{
              display: 'flex',
              flex: 1,
              marginLeft: 10,
              height: 22,
              borderRadius: 6,
              background: '#fff',
              border: '1px solid #ddd4c8',
              alignItems: 'center',
              paddingLeft: 10,
              paddingRight: 10,
              fontSize: 11,
              color: '#7a6f65',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            anteprima · {name.toLowerCase()}
          </div>
        </div>

        {/* Hero card */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '20px 28px 22px',
            background: `linear-gradient(160deg, ${primary} 0%, #4a342c 55%, ${accent} 160%)`,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 11,
              color: 'rgba(255,253,249,0.72)',
              fontFamily: 'system-ui, sans-serif',
              marginBottom: 10,
            }}
          >
            {city ? `${city} · anteprima personalizzata` : 'Anteprima personalizzata'}
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: nameSize,
              fontWeight: 700,
              color: '#fffdf9',
              lineHeight: 1.12,
              marginBottom: 10,
              maxWidth: 540,
            }}
          >
            {name}
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: 'rgba(255,253,249,0.9)',
              lineHeight: 1.35,
              marginBottom: 18,
              maxWidth: 500,
            }}
          >
            {headline}
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                background: accent,
                color: '#fffdf9',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'system-ui, sans-serif',
                marginRight: 14,
              }}
            >
              {cta}
            </div>
            {rating != null ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 12,
                  color: 'rgba(255,253,249,0.82)',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {Number(rating).toFixed(1)} Google
                {reviews != null ? ` · ${Number(reviews).toLocaleString('it-IT')} rec.` : ''}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: CACHE_HEADERS,
    },
  );
}
