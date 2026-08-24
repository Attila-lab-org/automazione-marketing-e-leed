import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  businessName: string;
  whatsappHref: string;
  siteHref: string;
};

export function RestaurantV3OwnerRibbon({ businessName, whatsappHref, siteHref }: Props) {
  return (
    <aside className={styles.ribbon} aria-label="Anteprima dimostrativa">
      <p>
        <strong>
          {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonTitle} · {businessName}
        </strong>
        <span className={styles.ribbonMuted}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonBody}</span>
      </p>
      <div className={styles.ribbonActions}>
        <a className={styles.ribbonWa} href={whatsappHref}>
          <span className={styles.ribbonCtaFull}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
          </span>
          <span className={styles.ribbonCtaShort}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCtaWhatsApp}
          </span>
        </a>
        <a className={styles.ribbonSite} href={siteHref}>
          <span className={styles.ribbonCtaFull}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCta}</span>
          <span className={styles.ribbonCtaShort}>Info</span>
        </a>
      </div>
    </aside>
  );
}
