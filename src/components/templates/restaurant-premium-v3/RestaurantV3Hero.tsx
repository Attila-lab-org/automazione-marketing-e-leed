import Image from 'next/image';
import styles from './restaurant-v3.module.css';

type Props = {
  name: string;
  city: string | null;
  headline: string;
  subheadline: string | null;
  heroSrc: string;
  rating: number | null;
  reviewCount: number | null;
  ctaLabel: string;
  ctaHref: string;
  phone: string | null;
};

function stars(rating: number) {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function isLocalAsset(src: string) {
  return src.startsWith('/') && !src.startsWith('/api/');
}

export function RestaurantV3Hero({
  name,
  city,
  headline,
  subheadline,
  heroSrc,
  rating,
  reviewCount,
  ctaLabel,
  ctaHref,
  phone,
}: Props) {
  return (
    <section className={styles.hero} aria-label="Presentazione">
      <div className={styles.heroMedia}>
        {isLocalAsset(heroSrc) ? (
          <Image
            src={heroSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.heroImg}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroSrc} alt="" className={styles.heroImg} />
        )}
        <div className={styles.heroOverlay} />
      </div>
      <div className={styles.heroContent}>
        {city ? <p className={styles.eyebrow}>{city}</p> : null}
        <h1 className={styles.heroTitle}>{name}</h1>
        <p className={styles.heroSub}>{headline}</p>
        {subheadline && subheadline !== headline ? (
          <p className={styles.heroSub} style={{ fontSize: '0.95rem', opacity: 0.88 }}>
            {subheadline}
          </p>
        ) : null}
        <div className={styles.heroMeta}>
          {rating != null ? (
            <span>
              <span className={styles.trustStars}>{stars(rating)}</span> {rating.toFixed(1)} su Google
              {reviewCount != null ? ` · ${reviewCount.toLocaleString('it-IT')} recensioni` : ''}
            </span>
          ) : null}
        </div>
        <div className={styles.heroActions}>
          <a className={`${styles.btn} ${styles.btnOnDark}`} href={ctaHref}>
            {ctaLabel}
          </a>
          {phone ? (
            <a className={`${styles.btn} ${styles.btnOnDarkGhost}`} href={`tel:${phone}`}>
              {phone}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
