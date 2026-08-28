import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';
import { ownerFinalBody } from '@/lib/templates/owner-commercial';
import { WhatsAppIcon } from './WhatsAppIcon';

type Props = {
  ownerCtaLabel: string;
  whatsappHref: string | null;
  phoneHref: string | null;
  siteHref: string | null;
  businessName: string;
  offerPrice?: string | null;
  deliveryTime?: string;
};

/** Owner-facing conversion only — never links to restaurant #contatti. */
export function RestaurantV3OwnerCTA({
  ownerCtaLabel,
  whatsappHref,
  phoneHref,
  siteHref,
  businessName,
  offerPrice = null,
  deliveryTime = '24 ore',
}: Props) {
  return (
    <section id="owner" className={styles.owner} aria-label="Proposta commerciale" data-reveal>
      <div className={styles.ownerGlow} aria-hidden />
      <div className={styles.ownerInner}>
        <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 55%, transparent)' }}>
          Offerta per {businessName}
        </p>
        {offerPrice ? (
          <div className={styles.ownerOffer}>
            <span className={styles.ownerOfferPrice}>{offerPrice}</span>
            <span className={styles.ownerOfferLabel}>
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferLabel}
            </span>
          </div>
        ) : null}
        <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerHeadline}</h2>
        <p>{ownerFinalBody(offerPrice, deliveryTime)}</p>
        <p className={styles.ownerContactHow}>
          {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerContactHow}
        </p>
        <p className={styles.ownerMicro}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerMicro}</p>
        <div className={styles.ownerActions}>
          {whatsappHref ? (
            <a className={`${styles.btn} ${styles.btnWhatsApp}`} href={whatsappHref}>
              <WhatsAppIcon size={20} />
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
            </a>
          ) : null}
          {phoneHref ? (
            <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href={phoneHref}>
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaPhone}
            </a>
          ) : null}
          {siteHref ? (
            <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href={siteHref}>
              {ownerCtaLabel || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaSite}
            </a>
          ) : null}
        </div>
        {whatsappHref || phoneHref ? (
          <ol className={styles.ownerSteps}>
            <li>Scrivi o chiama con un tocco</li>
            <li>Consegna in {deliveryTime}</li>
            <li>Assistenza diretta</li>
          </ol>
        ) : null}
      </div>
    </section>
  );
}
