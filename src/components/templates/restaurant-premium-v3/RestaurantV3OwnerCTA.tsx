import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ownerCtaLabel: string;
  ownerCtaHref: string;
};

export function RestaurantV3OwnerCTA({ ownerCtaLabel, ownerCtaHref }: Props) {
  return (
    <section className={styles.owner} aria-label="Proposta commerciale" data-reveal>
      <div className={styles.ownerInner}>
        <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 55%, transparent)' }}>
          Per il proprietario
        </p>
        <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerHeadline}</h2>
        <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBody}</p>
        <div className={styles.ownerActions}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={ownerCtaHref}>
            {ownerCtaLabel || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCta}
          </a>
          <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href="#contatti">
            Scopri di più
          </a>
        </div>
      </div>
    </section>
  );
}
