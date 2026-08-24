import styles from './restaurant-v3.module.css';
import { RESTAURANT_PREMIUM_V3_ASSETS, RESTAURANT_PREMIUM_V3_CONCEPT_COPY } from '@/lib/templates/v3-assets';

type Props = {
  description: string | null;
  imageSrc?: string | null;
};

export function RestaurantV3Intro({ description, imageSrc }: Props) {
  return (
    <section className={`${styles.section} ${styles.sectionNarrow}`} data-reveal>
      <div className={styles.intro}>
        <div className={styles.introCopy}>
          <p className={styles.eyebrow}>Editoriale</p>
          <h2>{RESTAURANT_PREMIUM_V3_CONCEPT_COPY.storyHeadline}</h2>
          <p>{description || RESTAURANT_PREMIUM_V3_CONCEPT_COPY.description}</p>
        </div>
        <figure className={styles.introFigure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc || RESTAURANT_PREMIUM_V3_ASSETS.interior}
            alt=""
            loading="lazy"
          />
        </figure>
      </div>
    </section>
  );
}
