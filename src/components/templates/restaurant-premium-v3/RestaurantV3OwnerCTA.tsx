import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ownerCtaLabel: string;
  whatsappHref: string;
  siteHref: string;
  businessName: string;
};

/** Owner-facing conversion only — never links to restaurant #contatti. */
export function RestaurantV3OwnerCTA({
  ownerCtaLabel,
  whatsappHref,
  siteHref,
  businessName,
}: Props) {
  return (
    <section id="owner" className={styles.owner} aria-label="Proposta commerciale" data-reveal>
      <div className={styles.ownerGlow} aria-hidden />
      <div className={styles.ownerInner}>
        <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 55%, transparent)' }}>
          Offerta per {businessName}
        </p>
        <div className={styles.ownerOffer}>
          <span className={styles.ownerOfferPrice}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferPrice}
          </span>
          <span className={styles.ownerOfferLabel}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerOfferLabel}
          </span>
        </div>
        <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerHeadline}</h2>
        <p>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerBody}</p>
        <p className={styles.ownerMicro}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerMicro}</p>
        <div className={styles.ownerActions}>
          <a className={`${styles.btn} ${styles.btnWhatsApp}`} href={whatsappHref}>
            {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
          </a>
          <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href={siteHref}>
            {ownerCtaLabel || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaSite}
          </a>
        </div>
        <ol className={styles.ownerSteps}>
          <li>WhatsApp in un tap</li>
          <li>Messaggio già pronto</li>
          <li>Ti rispondiamo noi</li>
        </ol>
      </div>
    </section>
  );
}
