import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

export const runtime = 'edge';

function absoluteAsset(requestUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  try {
    return new URL(path, requestUrl).toString();
  } catch {
    return path;
  }
}

function heroSrcForOg(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  if (v.startsWith('https://') || v.startsWith('http://') || v.startsWith('/')) return v;
  return null;
}

export async function GET(
  request: Request,
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

  const name = data.branding?.business_name?.trim() || 'Attività';
  const headline =
    data.content?.headline?.trim() ||
    (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline : RESTAURANT_PREMIUM_V2_DEFAULTS.content.headline) ||
    name;
  const sub =
    data.content?.subheadline?.trim() ||
    (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.subheadline : RESTAURANT_PREMIUM_V2_DEFAULTS.content.subheadline) ||
    '';
  const cta =
    data.content?.cta?.trim() ||
    (isV3 ? RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta : 'Prenota un tavolo');
  const accent = data.branding?.accent_color || (isV3 ? '#b86a45' : '#d97706');
  const primary = data.branding?.primary_color || (isV3 ? '#2c241e' : '#1c1917');
  const city = data.contact?.city?.trim() || '';
  const rating = data.signals?.rating;
  const reviews = data.signals?.review_count;
  const wordmark = name.toUpperCase();

  const rawHero =
    heroSrcForOg(data.branding?.hero_image) ||
    (isV3 ? RESTAURANT_PREMIUM_V3_ASSETS.hero : null);
  const heroUrl = rawHero ? absoluteAsset(request.url, rawHero) : null;
  const logoRaw = heroSrcForOg(data.branding?.logo_url);
  const logoUrl = logoRaw ? absoluteAsset(request.url, logoRaw) : null;

  if (isV3) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#f6f1ea',
            color: primary,
            fontFamily: 'Georgia, serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 36px',
              borderBottom: '1px solid rgba(44,36,30,0.1)',
              background: 'rgba(255,253,249,0.95)',
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} width={120} height={32} style={{ objectFit: 'contain' }} alt="" />
            ) : (
              <div style={{ fontSize: 18, letterSpacing: 4, fontWeight: 700 }}>{wordmark}</div>
            )}
            <div style={{ display: 'flex', gap: 22, fontSize: 15, color: '#7a6f65' }}>
              <span>Esperienza</span>
              <span>Galleria</span>
              <span>Contatti</span>
            </div>
            <div
              style={{
                background: accent,
                color: '#fffdf9',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {cta}
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', flex: 1, overflow: 'hidden' }}>
            {heroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroUrl}
                width={1200}
                height={680}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                alt=""
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(135deg, ${primary} 0%, #5c4033 55%, ${accent} 100%)`,
                  display: 'flex',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(44,36,30,0.25) 0%, rgba(44,36,30,0.55) 55%, rgba(44,36,30,0.88) 100%)',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '48px',
                width: '100%',
                color: '#fffdf9',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  letterSpacing: 1,
                  opacity: 0.55,
                  marginBottom: 10,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Anteprima preparata per {name}
              </div>
              {city ? (
                <div style={{ display: 'flex', fontSize: 16, letterSpacing: 5, textTransform: 'uppercase', opacity: 0.8 }}>
                  {city}
                </div>
              ) : null}
              <div style={{ display: 'flex', fontSize: 20, opacity: 0.85, marginTop: 8 }}>{name}</div>
              <div style={{ display: 'flex', fontSize: 52, fontWeight: 600, lineHeight: 1.05, marginTop: 10, maxWidth: 920 }}>
                {headline}
              </div>
              {sub ? (
                <div style={{ display: 'flex', fontSize: 22, opacity: 0.88, marginTop: 14, maxWidth: 780, lineHeight: 1.35 }}>
                  {sub}
                </div>
              ) : null}
              {rating != null ? (
                <div style={{ display: 'flex', fontSize: 20, marginTop: 18 }}>
                  {Number(rating).toFixed(1)}
                  {reviews != null
                    ? ` · ${Number(reviews).toLocaleString('it-IT')} recensioni Google`
                    : ' su Google'}
                </div>
              ) : null}
              <div
                style={{
                  marginTop: 26,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    background: accent,
                    color: '#fffdf9',
                    padding: '16px 28px',
                    borderRadius: 999,
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {cta}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 96, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.18)' }} />
                  <div style={{ width: 96, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.12)' }} />
                  <div style={{ width: 96, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.08)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 800 },
    );
  }

  // V1/V2 fallback preview (unchanged commercial card/viewport style)
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
            <div style={{ fontSize: 14, opacity: 0.7 }}>Concept demo</div>
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
          <div
            style={{
              background: accent,
              color: 'white',
              padding: '18px 32px',
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 700,
              alignSelf: 'flex-start',
            }}
          >
            {cta}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 800 },
  );
}
