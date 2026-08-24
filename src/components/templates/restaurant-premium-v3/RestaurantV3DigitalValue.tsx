import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ctaLabel: string;
  ctaHref: string;
};

export function RestaurantV3DigitalValue({ ctaLabel, ctaHref }: Props) {
  return (
    <section className={`${styles.section} ${styles.valueBand}`} data-reveal>
      <div className={`${styles.sectionNarrow} ${styles.valueInner}`}>
        <div>
          <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 65%, transparent)' }}>
            Prenotazione
          </p>
          <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.digitalValueHeadline}</h2>
          <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.digitalValueBody}</p>
        </div>
        <a className={`${styles.btn} ${styles.btnOnDark}`} href={ctaHref}>
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
