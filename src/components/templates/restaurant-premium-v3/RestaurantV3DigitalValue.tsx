import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

/** Value band — editorial, no competing “Prenota” button. */
export function RestaurantV3DigitalValue() {
  return (
    <section className={`${styles.section} ${styles.valueBand}`} data-reveal>
      <div className={`${styles.sectionNarrow} ${styles.valueInner}`}>
        <div>
          <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 65%, transparent)' }}>
            Esperienza digitale
          </p>
          <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.digitalValueHeadline}</h2>
          <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.digitalValueBody}</p>
        </div>
      </div>
    </section>
  );
}
