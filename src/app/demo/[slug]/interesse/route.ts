import { NextResponse } from 'next/server';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  buildWhatsAppUrl,
  isWhatsAppContactTarget,
  type OwnerContactChannel,
} from '@/lib/templates/v3-cta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STUDIO_FALLBACK = 'https://www.attila-lab.net/';
/** Commercial WhatsApp fallback when OWNER_WHATSAPP env is missing on Production. */
const STUDIO_WHATSAPP_FALLBACK = '393462689082';

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
  return STUDIO_FALLBACK;
}

function parseChannel(raw: string | null): OwnerContactChannel {
  const v = (raw ?? 'auto').toLowerCase();
  if (v === 'whatsapp' || v === 'wa') return 'whatsapp';
  if (v === 'site' || v === 'web') return 'site';
  return 'auto';
}

function resolveWhatsAppSource(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.OWNER_WHATSAPP?.trim();
  if (fromEnv) return fromEnv;
  if (env.OWNER_CONTACT_URL && isWhatsAppContactTarget(env.OWNER_CONTACT_URL)) {
    return env.OWNER_CONTACT_URL.trim();
  }
  if (
    env.NEXT_PUBLIC_OWNER_CONTACT_URL &&
    isWhatsAppContactTarget(env.NEXT_PUBLIC_OWNER_CONTACT_URL)
  ) {
    return env.NEXT_PUBLIC_OWNER_CONTACT_URL.trim();
  }
  return STUDIO_WHATSAPP_FALLBACK;
}

function resolveDestination(args: {
  env: NodeJS.ProcessEnv;
  channel: OwnerContactChannel;
  businessName?: string | null;
  slug: string;
}): { url: string; channel: 'whatsapp' | 'site' } | { error: string } {
  const { env, channel, businessName, slug } = args;

  // WhatsApp must never fall through to the marketing website.
  if (channel === 'whatsapp' || channel === 'auto') {
    const wa = buildWhatsAppUrl({
      phoneOrUrl: resolveWhatsAppSource(env),
      businessName,
      slug,
    });
    if (wa) {
      // auto → WhatsApp first (one-tap conversion); site remains available via ?channel=site
      if (channel === 'whatsapp' || channel === 'auto') {
        return { url: wa, channel: 'whatsapp' };
      }
    }
    if (channel === 'whatsapp') {
      return { error: 'OWNER_WHATSAPP non valido' };
    }
  }

  const siteCandidate = resolveOwnerContactUrl(env) ?? STUDIO_FALLBACK;
  const contactUrl = isWhatsAppContactTarget(siteCandidate) ? STUDIO_FALLBACK : siteCandidate;

  try {
    const dest = new URL(contactUrl);
    if (dest.protocol !== 'http:' && dest.protocol !== 'https:') {
      return { error: 'OWNER_CONTACT_URL non valido' };
    }
    return { url: dest.toString(), channel: 'site' };
  } catch {
    return { error: 'OWNER_CONTACT_URL non valido' };
  }
}

/**
 * Public owner CTA endpoint.
 * Logs OWNER_CTA_CLICKED then redirects to WhatsApp or commercial site.
 * Query: ?channel=whatsapp|site|auto
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const channel = parseChannel(new URL(request.url).searchParams.get('channel'));

  let businessName: string | null = null;
  let tracked = false;

  if (isSupabaseConfigured(process.env) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminSupabaseClient(process.env);
      const { data: site } = await admin
        .from('demo_sites')
        .select('id, workspace_id, lead_id, status')
        .eq('slug', slug)
        .maybeSingle();

      if (site && site.status !== 'DISABLED' && site.status !== 'EXPIRED') {
        const { data: lead } = await admin
          .from('leads')
          .select('name')
          .eq('id', site.lead_id)
          .maybeSingle();
        businessName = lead?.name ?? null;

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
            channel,
            referer,
            path: `/demo/${slug}/interesse`,
          },
        });
        tracked = true;
      }
    } catch {
      // Tracking best-effort — never block the commercial redirect
    }
  }

  const resolved = resolveDestination({
    env: process.env,
    channel,
    businessName,
    slug,
  });

  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 503 });
  }

  let dest: URL;
  try {
    dest = new URL(resolved.url);
  } catch {
    return NextResponse.json({ error: 'Destinazione non valida' }, { status: 503 });
  }

  // Site redirects get attribution query; WhatsApp keeps its own text payload
  if (resolved.channel === 'site') {
    dest.searchParams.set('demo', slug);
    dest.searchParams.set('source', 'restaurant-premium-v3-owner-cta');
    if (tracked) dest.searchParams.set('tracked', '1');
  }

  return NextResponse.redirect(dest.toString(), 302);
}
