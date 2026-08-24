import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  businessName: string;
  ownerCtaHref: string;
  ownerCtaLabel: string;
};

export function RestaurantV3OwnerRibbon({ businessName, ownerCtaHref, ownerCtaLabel }: Props) {
  return (
    <aside className={styles.ribbon} aria-label="Anteprima dimostrativa">
      <p>
        <strong>
          {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonTitle} · {businessName}
        </strong>
        <span className={styles.ribbonMuted}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonBody}</span>
      </p>
      <a href={ownerCtaHref}>
        <span className={styles.ribbonCtaFull}>
          {ownerCtaLabel || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCta}
        </span>
        <span className={styles.ribbonCtaShort}>Parliamone</span>
      </a>
    </aside>
  );
}
