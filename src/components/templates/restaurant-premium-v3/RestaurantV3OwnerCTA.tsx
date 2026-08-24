import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';
import { ownerFinalBody } from '@/lib/templates/owner-commercial';

type Props = {
  ownerCtaLabel: string;
  whatsappHref: string | null;
  siteHref: string | null;
  businessName: string;
  offerPrice?: string | null;
};

/** Owner-facing conversion only — never links to restaurant #contatti. */
export function RestaurantV3OwnerCTA({
  ownerCtaLabel,
  whatsappHref,
  siteHref,
  businessName,
  offerPrice = null,
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
        <p>{ownerFinalBody(offerPrice)}</p>
        <p className={styles.ownerMicro}>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerMicro}</p>
        <div className={styles.ownerActions}>
          {whatsappHref ? (
            <a className={`${styles.btn} ${styles.btnWhatsApp}`} href={whatsappHref}>
              {RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}
            </a>
          ) : null}
          {siteHref ? (
            <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href={siteHref}>
              {ownerCtaLabel || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaSite}
            </a>
          ) : null}
        </div>
        {whatsappHref ? (
          <ol className={styles.ownerSteps}>
            <li>WhatsApp con un tocco</li>
            <li>Messaggio già pronto</li>
            <li>Ti rispondiamo noi</li>
          </ol>
        ) : null}
      </div>
    </section>
  );
}
