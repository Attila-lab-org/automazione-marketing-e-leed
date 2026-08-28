import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';
import { ownerRibbonBody } from '@/lib/templates/owner-commercial';
import { WhatsAppIcon } from './WhatsAppIcon';

type Props = {
  businessName: string;
  whatsappHref: string | null;
  siteHref: string | null;
  offerPrice?: string | null;
  deliveryTime?: string;
};

export function RestaurantV3OwnerRibbon({
  businessName,
  whatsappHref,
  siteHref,
  offerPrice = null,
  deliveryTime = '24 ore',
}: Props) {
  return (
    <aside className={styles.ribbon} aria-label="Anteprima dimostrativa">
      <p>
        <strong>
          {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonTitle} · {businessName}
        </strong>
        <span className={styles.ribbonMuted}>
          {ownerRibbonBody(offerPrice, deliveryTime)}
        </span>
      </p>
      <div className={styles.ribbonActions}>
        {whatsappHref ? (
          <a className={styles.ribbonWa} href={whatsappHref}>
            <WhatsAppIcon size={16} />
            <span className={styles.ribbonCtaFull}>
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
            </span>
            <span className={styles.ribbonCtaShort}>
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCtaWhatsApp}
            </span>
          </a>
        ) : null}
        {siteHref ? (
          <a className={styles.ribbonSite} href={siteHref}>
            <span className={styles.ribbonCtaFull}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ribbonCta}</span>
            <span className={styles.ribbonCtaShort}>Info</span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}
