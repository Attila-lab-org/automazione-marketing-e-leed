import styles from './restaurant-v3.module.css';

type Props = {
  rating: number | null;
  reviewCount: number | null;
};

export function RestaurantV3Trust({ rating, reviewCount }: Props) {
  if (rating == null && reviewCount == null) return null;
  const full = rating != null ? Math.round(Math.min(5, Math.max(0, rating))) : 0;
  return (
    <section className={`${styles.section} ${styles.trust}`} data-reveal>
      <div>
        <p className={styles.eyebrow}>Fiducia Google</p>
        {rating != null ? <p className={styles.trustScore}>{rating.toFixed(1)}</p> : null}
      </div>
      <div>
        {rating != null ? (
          <p className={styles.trustStars} aria-hidden>
            {'★'.repeat(full)}
            {'☆'.repeat(5 - full)}
          </p>
        ) : null}
        <p style={{ margin: '0.35rem 0 0', color: 'var(--restaurant-muted)' }}>
          {rating != null ? `${rating.toFixed(1)} su Google` : 'Google'}
          {reviewCount != null ? ` · ${reviewCount.toLocaleString('it-IT')} recensioni` : ''}
        </p>
      </div>
    </section>
  );
}
