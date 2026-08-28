import styles from './restaurant-v3.module.css';

type Props = {
  images: string[];
};

export function RestaurantV3Gallery({ images }: Props) {
  const list = images.filter(Boolean).slice(0, 5);
  if (!list.length) return null;
  return (
    <section id="galleria" className={`${styles.section} ${styles.sectionNarrow}`} data-reveal>
      <p className={styles.eyebrow}>Galleria</p>
      <h2
        className={styles.display}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 4vw, 3rem)',
          margin: '0.6rem 0 1.5rem',
        }}
      >
        Uno sguardo al locale
      </h2>
      <div className={styles.gallery}>
        {list.map((src, i) => (
          <figure key={`${src}-${i}`} className={styles.galleryItem}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" />
          </figure>
        ))}
      </div>
    </section>
  );
}
