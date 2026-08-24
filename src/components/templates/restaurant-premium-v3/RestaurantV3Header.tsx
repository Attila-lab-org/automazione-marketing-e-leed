import styles from './restaurant-v3.module.css';

type Props = {
  name: string;
  logoUrl: string | null;
  ctaLabel: string;
  ctaHref: string;
  scrolled: boolean;
};

export function RestaurantV3Header({ name, logoUrl, ctaLabel, ctaHref, scrolled }: Props) {
  return (
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className={styles.logo} />
      ) : (
        <p className={styles.wordmark}>{name}</p>
      )}
      <nav className={styles.nav} aria-label="Sezioni">
        <a href="#esperienza">Esperienza</a>
        <a href="#galleria">Galleria</a>
        <a href="#contatti">Contatti</a>
      </nav>
      <a className={`${styles.btn} ${styles.btnPrimary}`} href={ctaHref}>
        {ctaLabel}
      </a>
    </header>
  );
}
