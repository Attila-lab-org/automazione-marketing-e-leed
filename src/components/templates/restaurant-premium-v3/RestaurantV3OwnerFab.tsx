import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  href: string;
};

/** Persistent owner WhatsApp chip — low friction on mobile after scroll. */
export function RestaurantV3OwnerFab({ href }: Props) {
  return (
    <a className={styles.ownerFab} href={href} aria-label={RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCtaWhatsApp}>
      <span className={styles.ownerFabDot} aria-hidden />
      WhatsApp
    </a>
  );
}
