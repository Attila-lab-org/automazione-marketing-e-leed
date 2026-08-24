import { ImageResponse } from 'next/og';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

export const runtime = 'edge';

/** QA-only OG preview (no DB) for visual certification. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const heroUrl = `${origin}${RESTAURANT_PREMIUM_V3_ASSETS.hero}`;
  const name = 'Trattoria Duomo';
  const city = 'Milano';
  const headline = RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline;
  const sub = RESTAURANT_PREMIUM_V3_CONCEPT_COPY.subheadline;
  const cta = RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta;
  const accent = '#b86a45';
  const primary = '#2c241e';

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
          <div style={{ fontSize: 18, letterSpacing: 4, fontWeight: 700 }}>{name.toUpperCase()}</div>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl}
            width={1200}
            height={680}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
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
              padding: 48,
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
            <div style={{ display: 'flex', fontSize: 16, letterSpacing: 5, textTransform: 'uppercase', opacity: 0.8 }}>
              {city}
            </div>
            <div style={{ display: 'flex', fontSize: 20, opacity: 0.85, marginTop: 8 }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 600, lineHeight: 1.05, marginTop: 10, maxWidth: 920 }}>
              {headline}
            </div>
            <div style={{ display: 'flex', fontSize: 22, opacity: 0.88, marginTop: 14, maxWidth: 780, lineHeight: 1.35 }}>
              {sub}
            </div>
            <div style={{ display: 'flex', fontSize: 20, marginTop: 18 }}>4.7 · 1.082 recensioni Google</div>
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                background: accent,
                color: '#fffdf9',
                padding: '16px 28px',
                borderRadius: 999,
                fontSize: 22,
                fontWeight: 700,
                alignSelf: 'flex-start',
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
