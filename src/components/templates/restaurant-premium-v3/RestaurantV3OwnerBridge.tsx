import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';
import { ownerBridgeBody } from '@/lib/templates/owner-commercial';
import { WhatsAppIcon } from './WhatsAppIcon';

type Props = {
  businessName: string;
  whatsappHref: string | null;
  offerPrice?: string | null;
};

/**
 * Mid-page owner bridge — optional (OWNER_SHOW_BRIDGE). Default OFF.
 */
export function RestaurantV3OwnerBridge({
  businessName,
  whatsappHref,
  offerPrice = null,
}: Props) {
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
          <p>
            {ownerBridgeBody(offerPrice, RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeBody)}
          </p>
        </div>
        <div className={styles.ownerBridgeAside}>
          {offerPrice ? (
            <p className={styles.ownerBridgePrice}>
              <span>{offerPrice}</span>
              <small>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferLabel}</small>
            </p>
          ) : null}
          {whatsappHref ? (
            <a className={`${styles.btn} ${styles.btnWhatsApp}`} href={whatsappHref}>
              <WhatsAppIcon size={18} />
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
            </a>
          ) : null}
          <a className={styles.ownerBridgeMore} href="#owner">
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBridgeMore}
          </a>
        </div>
      </div>
    </section>
  );
}
