'use client';

import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import type { DemoInstanceDataV3 } from '@/lib/templates/restaurant-premium-v3';
import { resolveOwnerCtaHref, resolveRestaurantCtaHref } from '@/lib/templates/v3-cta';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';
import { wordmarkFromName } from '@/lib/templates/wordmark';
import { RestaurantV3DigitalValue } from './RestaurantV3DigitalValue';
import { RestaurantV3Experience } from './RestaurantV3Experience';
import { RestaurantV3FinalCTA } from './RestaurantV3FinalCTA';
import { RestaurantV3Gallery } from './RestaurantV3Gallery';
import { RestaurantV3Header } from './RestaurantV3Header';
import { RestaurantV3Hero } from './RestaurantV3Hero';
import { RestaurantV3Intro } from './RestaurantV3Intro';
import { RestaurantV3Location } from './RestaurantV3Location';
import { RestaurantV3OwnerBridge } from './RestaurantV3OwnerBridge';
import { RestaurantV3OwnerCTA } from './RestaurantV3OwnerCTA';
import { RestaurantV3OwnerFab } from './RestaurantV3OwnerFab';
import { RestaurantV3OwnerRibbon } from './RestaurantV3OwnerRibbon';
import { RestaurantV3Story } from './RestaurantV3Story';
import { RestaurantV3Trust } from './RestaurantV3Trust';
import { useHeaderScroll, useReveal } from './hooks';
import styles from './restaurant-v3.module.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-restaurant-display',
  display: 'swap',
});

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-restaurant-sans',
  display: 'swap',
});

export type RestaurantPremiumV3Props = {
  data: DemoInstanceDataV3;
  compact?: boolean;
  /** Public demo slug — enables /demo/[slug]/interesse owner CTA. */
  demoSlug?: string;
};

/**
 * Landing focus (dual audience):
 * - Diner simulation: ONE booking goal → header + hero + final CTA only
 * - Owner conversion: ribbon + mid-page bridge + final offer + WhatsApp FAB
 */
export default function RestaurantPremiumV3({
  data,
  compact = false,
  demoSlug,
}: RestaurantPremiumV3Props) {
  useReveal();
  const scrolled = useHeaderScroll();

  const name = data.branding.business_name?.trim() || 'Attività';
  const primary = data.branding.primary_color || '#2c241e';
  const accent = data.branding.accent_color || '#b86a45';
  const hero =
    data.branding.hero_image?.trim() || RESTAURANT_PREMIUM_V3_ASSETS.hero;
  const gallery =
    data.branding.gallery.filter(Boolean).length > 0
      ? data.branding.gallery.filter(Boolean)
      : [...RESTAURANT_PREMIUM_V3_ASSETS.gallery];
  const headline =
    data.content.headline?.trim() || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline;
  const subheadline =
    data.content.subheadline?.trim() || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.subheadline;
  const description =
    data.content.description?.trim() ||
    data.content.about?.trim() ||
    RESTAURANT_PREMIUM_V3_CONCEPT_COPY.description;
  const cta = data.content.cta?.trim() || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta;
  const ctaShort = RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ctaShort;
  const ctaHref = resolveRestaurantCtaHref({
    ctaUrl: data.content.cta_url,
    phone: data.contact.phone,
  });
  const ownerCta =
    data.content.owner_cta_label?.trim() || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaSite;
  const ownerWhatsAppHref = resolveOwnerCtaHref({
    demoSlug,
    channel: 'whatsapp',
  });
  const siteHref = resolveOwnerCtaHref({
    demoSlug,
    channel: 'site',
  });

  const tokenStyle = {
    ['--restaurant-primary' as string]: primary,
    ['--restaurant-accent' as string]: accent,
    ['--restaurant-text' as string]: primary,
  };

  return (
    <div
      className={`${styles.rpv3} ${display.variable} ${sans.variable} ${compact ? styles.rpv3Compact : ''}`}
      style={tokenStyle}
      data-renderer="restaurant-premium-v3"
    >
      {!compact ? (
        <RestaurantV3OwnerRibbon
          businessName={name}
          whatsappHref={ownerWhatsAppHref}
          siteHref={siteHref}
        />
      ) : null}
      <RestaurantV3Header
        name={wordmarkFromName(name) || name}
        logoUrl={data.branding.logo_url}
        ctaLabel={ctaShort}
        ctaHref={ctaHref}
        scrolled={scrolled}
      />
      <RestaurantV3Hero
        name={name}
        city={data.contact.city}
        headline={headline}
        subheadline={subheadline}
        heroSrc={hero}
        rating={data.signals.rating}
        reviewCount={data.signals.review_count}
        ctaLabel={cta}
        ctaHref={ctaHref}
        phone={data.contact.phone}
      />
      <RestaurantV3Trust rating={data.signals.rating} reviewCount={data.signals.review_count} />
      <RestaurantV3Intro description={description} imageSrc={gallery[0]} />
      <RestaurantV3Experience />
      {!compact ? (
        <RestaurantV3OwnerBridge businessName={name} whatsappHref={ownerWhatsAppHref} />
      ) : null}
      <RestaurantV3Story />
      <RestaurantV3Gallery images={gallery} />
      <div id="prenota">
        <RestaurantV3DigitalValue />
      </div>
      <RestaurantV3Location
        address={data.contact.address}
        city={data.contact.city}
        phone={data.contact.phone}
        email={data.contact.email}
        openingHours={data.contact.opening_hours}
      />
      <RestaurantV3FinalCTA ctaLabel={cta} ctaHref={ctaHref} />
      {!compact ? (
        <RestaurantV3OwnerCTA
          ownerCtaLabel={ownerCta}
          whatsappHref={ownerWhatsAppHref}
          siteHref={siteHref}
          businessName={name}
        />
      ) : null}
      {!compact && demoSlug ? <RestaurantV3OwnerFab href={ownerWhatsAppHref} /> : null}
      <footer className={styles.footer}>
        <span>{name}</span>
        <span>Concept demo · Restaurant Premium V3</span>
      </footer>
    </div>
  );
}
