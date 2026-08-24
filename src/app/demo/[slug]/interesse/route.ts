import { NextResponse } from 'next/server';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Commercial owner contact destination.
 * Prefer OWNER_CONTACT_URL env; fall back to the studio site when Production env
 * is permission-locked on Vercel (same class of issue as ADMIN_* unlock).
 * Never uses mailto without a recipient.
 */
export function resolveOwnerContactUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.OWNER_CONTACT_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromPublic = env.NEXT_PUBLIC_OWNER_CONTACT_URL?.trim();
  if (fromPublic) return fromPublic;
  // Built-in commercial fallback (studio site — not a personal mailbox)
  return 'https://www.attila-lab.net/';
}

/**
 * Public owner CTA endpoint.
 * Logs OWNER_CTA_CLICKED then redirects to OWNER_CONTACT_URL (workspace commercial contact).
 * Never embeds a personal mailbox in the demo renderer.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const contactUrl = resolveOwnerContactUrl(process.env);
  if (!contactUrl) {
    return NextResponse.json(
      {
        error:
          'OWNER_CONTACT_URL non configurato sul server. Imposta la destinazione commerciale owner.',
      },
      { status: 503 },
    );
  }

  let dest: URL;
  try {
    dest = new URL(contactUrl);
    if (dest.protocol !== 'http:' && dest.protocol !== 'https:') {
      return NextResponse.json({ error: 'OWNER_CONTACT_URL non valido' }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: 'OWNER_CONTACT_URL non valido' }, { status: 503 });
  }

  if (isSupabaseConfigured(process.env) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminSupabaseClient(process.env);
      const { data: site } = await admin
        .from('demo_sites')
        .select('id, workspace_id, lead_id, status')
        .eq('slug', slug)
        .maybeSingle();

      if (site && site.status !== 'DISABLED' && site.status !== 'EXPIRED') {
        const referer = request.headers.get('referer');
        await admin.from('activity_log').insert({
          workspace_id: site.workspace_id,
          actor_type: 'SYSTEM',
          entity_type: 'demo_site',
          entity_id: site.id,
          lead_id: site.lead_id,
          category: 'BUSINESS',
          event_type: 'OWNER_CTA_CLICKED',
          message: 'Owner CTA clicked from public demo',
          data: {
            slug,
            demoId: site.id,
            leadId: site.lead_id,
            referer,
            path: `/demo/${slug}/interesse`,
          },
        });
      }
    } catch {
      // Tracking best-effort — never block the commercial redirect
    }
  }

  dest.searchParams.set('demo', slug);
  dest.searchParams.set('source', 'restaurant-premium-v3-owner-cta');
  return NextResponse.redirect(dest.toString(), 302);
}
