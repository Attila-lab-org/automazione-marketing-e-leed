import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  ownerCtaLabel: string;
  whatsappHref: string;
  siteHref: string;
};

/** Owner-facing conversion only — never links to restaurant #contatti. */
export function RestaurantV3OwnerCTA({ ownerCtaLabel, whatsappHref, siteHref }: Props) {
  return (
    <section id="owner" className={styles.owner} aria-label="Proposta commerciale" data-reveal>
      <div className={styles.ownerInner}>
        <p className={styles.eyebrow} style={{ color: 'color-mix(in srgb, #fff 55%, transparent)' }}>
          Per il proprietario
        </p>
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
          <li>Apri WhatsApp</li>
          <li>Messaggio già pronto</li>
          <li>Ti rispondiamo noi</li>
        </ol>
      </div>
    </section>
  );
}
