'use client';

import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import type { DemoInstanceDataV3 } from '@/lib/templates/restaurant-premium-v3';
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
import { RestaurantV3OwnerCTA } from './RestaurantV3OwnerCTA';
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
};

export default function RestaurantPremiumV3({ data, compact = false }: RestaurantPremiumV3Props) {
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
  const ctaHref =
    data.content.cta_url?.trim() ||
    (data.contact.phone ? `tel:${data.contact.phone}` : '#prenota');
  const ownerCta =
    data.content.owner_cta_label?.trim() || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCta;
  const ownerHref =
    data.content.owner_cta_url?.trim() ||
    `mailto:?subject=${encodeURIComponent(`Demo ${name}`)}`;

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
          ownerCtaHref={ownerHref}
          ownerCtaLabel={RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCta}
        />
      ) : null}
      <RestaurantV3Header
        name={wordmarkFromName(name) || name}
        logoUrl={data.branding.logo_url}
        ctaLabel={cta}
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
      <RestaurantV3Story ctaLabel={cta} ctaHref={ctaHref} />
      <RestaurantV3Gallery images={gallery} />
      <div id="prenota">
        <RestaurantV3DigitalValue ctaLabel={cta} ctaHref={ctaHref} />
      </div>
      <RestaurantV3Location
        address={data.contact.address}
        city={data.contact.city}
        phone={data.contact.phone}
        email={data.contact.email}
        openingHours={data.contact.opening_hours}
      />
      <RestaurantV3FinalCTA ctaLabel={cta} ctaHref={ctaHref} />
      {!compact ? <RestaurantV3OwnerCTA ownerCtaLabel={ownerCta} ownerCtaHref={ownerHref} /> : null}
      <footer className={styles.footer}>
        <span>{name}</span>
        <span>Concept demo · Restaurant Premium V3</span>
      </footer>
    </div>
  );
}
