import { ImageResponse } from 'next/og';
import { loadDemoBySlug } from '@/lib/demos/load';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

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
    branding?: { business_name?: string | null; accent_color?: string | null };
    content?: { headline?: string | null; cta?: string | null };
    signals?: { rating?: number | null; review_count?: number | null };
    contact?: { city?: string | null };
  };

  const name = data.branding?.business_name ?? 'Attività';
  const headline = data.content?.headline ?? name;
  const cta = data.content?.cta ?? 'Vedi anteprima completa';
  const accent = data.branding?.accent_color ?? '#d97706';
  const city = data.contact?.city ?? '';
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
          background: 'linear-gradient(135deg, #1c1917 0%, #44403c 100%)',
          color: 'white',
          padding: 48,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {city ? (
            <div style={{ fontSize: 18, letterSpacing: 4, opacity: 0.7, textTransform: 'uppercase' }}>
              {city}
            </div>
          ) : null}
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>{headline}</div>
          {rating != null && reviews != null ? (
            <div style={{ fontSize: 24, opacity: 0.85 }}>
              ★ {rating.toFixed(1)} · {reviews.toLocaleString('it-IT')} recensioni Google
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, opacity: 0.8 }}>Anteprima / concept dimostrativo</div>
          <div
            style={{
              background: accent,
              color: 'white',
              padding: '16px 28px',
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 600,
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
