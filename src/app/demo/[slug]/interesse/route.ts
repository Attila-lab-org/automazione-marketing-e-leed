import { NextResponse } from 'next/server';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getOwnerOfferPrice } from '@/lib/templates/owner-commercial';
import {
  buildWhatsAppUrl,
  extractContactPhone,
  isWhatsAppContactTarget,
  type OwnerContactChannel,
} from '@/lib/templates/v3-cta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Commercial owner contact destination.
 * OWNER_CONTACT_URL only — no hardcoded studio fallback.
 */
export function resolveOwnerContactUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.OWNER_CONTACT_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromPublic = env.NEXT_PUBLIC_OWNER_CONTACT_URL?.trim();
  if (fromPublic) return fromPublic;
  return null;
}

function parseChannel(raw: string | null): OwnerContactChannel {
  const v = (raw ?? 'auto').toLowerCase();
  if (v === 'whatsapp' || v === 'wa') return 'whatsapp';
  if (v === 'phone' || v === 'tel' || v === 'call') return 'phone';
  if (v === 'site' || v === 'web') return 'site';
  return 'auto';
}

function resolveWhatsAppSource(env: NodeJS.ProcessEnv): string | null {
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
  return null;
}

function resolveDestination(args: {
  env: NodeJS.ProcessEnv;
  channel: OwnerContactChannel;
  businessName?: string | null;
  slug: string;
}): { url: string; channel: 'whatsapp' | 'phone' | 'site' } | { error: string } {
  const { env, channel, businessName, slug } = args;
  const offerPrice = getOwnerOfferPrice(env);

  if (channel === 'phone') {
    const phone = extractContactPhone(
      env.OWNER_PHONE?.trim() || env.OWNER_WHATSAPP?.trim() || '',
    );
    return phone
      ? { url: `tel:+${phone}`, channel: 'phone' }
      : { error: 'Numero telefonico non configurato' };
  }

  if (channel === 'whatsapp' || channel === 'auto') {
    const source = resolveWhatsAppSource(env);
    if (source) {
      const wa = buildWhatsAppUrl({
        phoneOrUrl: source,
        businessName,
        slug,
        offerPrice,
      });
      if (wa) {
        return { url: wa, channel: 'whatsapp' };
      }
    }
    if (channel === 'whatsapp') {
      return { error: 'OWNER_WHATSAPP non configurato' };
    }
  }

  const siteCandidate = resolveOwnerContactUrl(env);
  if (!siteCandidate) {
    return { error: 'OWNER_CONTACT_URL non configurato' };
  }
  if (isWhatsAppContactTarget(siteCandidate)) {
    return { error: 'OWNER_CONTACT_URL non valido per channel=site' };
  }

  try {
    const dest = new URL(siteCandidate);
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
 * Query: ?channel=whatsapp|phone|site|auto
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

  if (resolved.channel === 'site') {
    dest.searchParams.set('demo', slug);
    dest.searchParams.set('source', 'restaurant-premium-v3-owner-cta');
    if (tracked) dest.searchParams.set('tracked', '1');
  }

  return NextResponse.redirect(dest.toString(), 302);
}
