import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ctaLabel: string;
  ctaHref: string;
};

export function RestaurantV3FinalCTA({ ctaLabel, ctaHref }: Props) {
  return (
    <section className={styles.finalCta} data-reveal>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={RESTAURANT_PREMIUM_V3_ASSETS.atmosphere} alt="" loading="lazy" />
      <div className={styles.finalCtaOverlay} />
      <div className={styles.finalCtaContent}>
        <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 70%, transparent)' }}>
          Prenota
        </p>
        <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.finalCtaHeadline}</h2>
        <p style={{ opacity: 0.85, marginBottom: '1.25rem' }}>
          {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.finalCtaBody}
        </p>
        <a className={`${styles.btn} ${styles.btnOnDark}`} href={ctaHref}>
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
