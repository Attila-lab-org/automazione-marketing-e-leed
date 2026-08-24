import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

export function RestaurantV3Experience() {
  const items = RESTAURANT_PREMIUM_V3_CONCEPT_COPY.experience;
  return (
    <section id="esperienza" className={`${styles.section} ${styles.sectionNarrow}`} data-reveal>
      <p className={styles.eyebrow}>Esperienza</p>
      <div className={styles.experienceGrid} style={{ marginTop: '1.5rem' }}>
        <article className={`${styles.experienceCard} ${styles.experienceFeatured}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={RESTAURANT_PREMIUM_V3_ASSETS.foodDetail} alt="" loading="lazy" />
          <p className={styles.experienceIndex}>01</p>
          <h3>{items[0]!.title}</h3>
          <p>{items[0]!.body}</p>
        </article>
        {items.slice(1).map((item, i) => (
          <article key={item.title} className={styles.experienceCard}>
            <p className={styles.experienceIndex}>{String(i + 2).padStart(2, '0')}</p>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
