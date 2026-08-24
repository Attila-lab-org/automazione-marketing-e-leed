import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  businessName: string;
  whatsappHref: string;
};

/**
 * Mid-page owner bridge — surfaces the commercial offer before the page ends,
 * without looking like another restaurant “Prenota” button.
 */
export function RestaurantV3OwnerBridge({ businessName, whatsappHref }: Props) {
  return (
    <section className={styles.ownerBridge} aria-label="Proposta per il proprietario" data-reveal>
      <div className={`${styles.sectionNarrow} ${styles.ownerBridgeInner}`}>
        <div className={styles.ownerBridgeCopy}>
          <p className={styles.eyebrow}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeEyebrow}</p>
          <h2>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeHeadline.replace(
              '{name}',
              businessName,
            )}
          </h2>
          <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeBody}</p>
        </div>
        <div className={styles.ownerBridgeAside}>
          <p className={styles.ownerBridgePrice}>
            <span>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferPrice}</span>
            <small>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferLabel}</small>
          </p>
          <a className={`${styles.btn} ${styles.btnWhatsApp}`} href={whatsappHref}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
          </a>
          <a className={styles.ownerBridgeMore} href="#owner">
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeMore}
          </a>
        </div>
      </div>
    </section>
  );
}
