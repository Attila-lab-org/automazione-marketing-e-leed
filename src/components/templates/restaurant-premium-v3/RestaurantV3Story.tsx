import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ctaLabel: string;
  ctaHref: string;
};

export function RestaurantV3Story({ ctaLabel, ctaHref }: Props) {
  return (
    <section className={`${styles.section} ${styles.sectionNarrow}`} data-reveal>
      <div className={styles.story}>
        <figure className={styles.storyMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={RESTAURANT_PREMIUM_V3_ASSETS.table} alt="" loading="lazy" />
        </figure>
        <div className={`${styles.storyCopy} ${styles.storySticky}`}>
          <p className={styles.eyebrow}>Racconto</p>
          <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.storyHeadline}</h2>
          <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.storyBody}</p>
          <p style={{ marginTop: '1.25rem' }}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href={ctaHref}>
              {ctaLabel}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
