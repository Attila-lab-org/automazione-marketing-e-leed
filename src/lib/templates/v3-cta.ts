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

/**
 * Owner-facing CTA: explicit URL wins; otherwise public interest endpoint for the demo slug.
 * Never returns mailto without a recipient.
 */
export function resolveOwnerCtaHref(args: {
  demoSlug?: string | null;
  ownerCtaUrl?: string | null;
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
  if (slug) return `/demo/${encodeURIComponent(slug)}/interesse`;
  return '#owner';
}

export function isMailtoWithoutRecipient(href: string): boolean {
  const t = href.trim().toLowerCase();
  if (!t.startsWith('mailto:')) return false;
  const rest = t.slice('mailto:'.length);
  const addr = rest.split('?')[0]?.trim() ?? '';
  return addr.length === 0;
}
