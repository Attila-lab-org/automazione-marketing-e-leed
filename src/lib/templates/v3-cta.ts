/**
 * Restaurant-facing CTA resolution for Restaurant Premium V3.
 * Never points a CTA at its own section (#prenota).
 */
export function resolveRestaurantCtaHref(args: {
  ctaUrl?: string | null;
  phone?: string | null;
}): string {
  const booking = args.ctaUrl?.trim();
  if (booking) return booking;
  const phone = args.phone?.trim();
  if (phone) return `tel:${phone}`;
  return '#contatti';
}

export type OwnerContactChannel = 'whatsapp' | 'site' | 'auto';

/**
 * Owner-facing CTA: explicit URL wins; otherwise public interest endpoint for the demo slug.
 * Never returns mailto without a recipient.
 */
export function resolveOwnerCtaHref(args: {
  demoSlug?: string | null;
  ownerCtaUrl?: string | null;
  channel?: OwnerContactChannel;
}): string {
  const explicit = args.ownerCtaUrl?.trim();
  if (explicit) {
    if (explicit.toLowerCase().startsWith('mailto:')) {
      const addr = explicit.slice('mailto:'.length).split('?')[0]?.trim();
      if (!addr) {
        // Invalid dead-end mailto — fall through to interest route if possible
      } else {
        return explicit;
      }
    } else {
      return explicit;
    }
  }
  const slug = args.demoSlug?.trim();
  if (slug) {
    const base = `/demo/${encodeURIComponent(slug)}/interesse`;
    const channel = args.channel && args.channel !== 'auto' ? args.channel : null;
    return channel ? `${base}?channel=${channel}` : base;
  }
  return '#owner';
}

export function isMailtoWithoutRecipient(href: string): boolean {
  const t = href.trim().toLowerCase();
  if (!t.startsWith('mailto:')) return false;
  const rest = t.slice('mailto:'.length);
  const addr = rest.split('?')[0]?.trim() ?? '';
  return addr.length === 0;
}

export function isWhatsAppContactTarget(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return (
    t.includes('wa.me') ||
    t.includes('api.whatsapp.com') ||
    t.startsWith('whatsapp:') ||
    /^(\+|00)?\d{8,15}$/.test(t.replace(/[\s()-]/g, ''))
  );
}

/** Digits-only international phone, or null. */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Build a WhatsApp deep link with a prefilled commercial message.
 * Accepts phone digits, wa.me URL, or api.whatsapp.com URL.
 */
export function buildWhatsAppUrl(args: {
  phoneOrUrl: string;
  businessName?: string | null;
  slug?: string | null;
}): string | null {
  const raw = args.phoneOrUrl.trim();
  if (!raw) return null;

  const text = [
    'Ciao Attila Lab,',
    args.businessName?.trim()
      ? `ho visto l'anteprima demo per ${args.businessName.trim()}.`
      : "ho visto l'anteprima demo del mio locale.",
    'Vorrei la versione completa — possiamo parlarne?',
    args.slug?.trim() ? `(rif: ${args.slug.trim()})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    if (/wa\.me|api\.whatsapp\.com/i.test(raw) || raw.toLowerCase().startsWith('http')) {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (!u.searchParams.get('text')) u.searchParams.set('text', text);
      return u.toString();
    }
  } catch {
    // fall through to phone parse
  }

  const phone = normalizeWhatsAppPhone(raw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
