import styles from './restaurant-v3.module.css';

type Props = {
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  openingHours: string | null;
};

export function RestaurantV3Location({ address, city, phone, email, openingHours }: Props) {
  const hasAny = Boolean(address || city || phone || email || openingHours);
  if (!hasAny) return null;
  return (
    <section id="contatti" className={`${styles.section} ${styles.sectionNarrow}`} data-reveal>
      <div className={styles.location}>
        <div className={styles.locationCard}>
          <h3>Dove trovarci</h3>
          <dl>
            {address || city ? (
              <div>
                <dt>Indirizzo</dt>
                <dd>{[address, city].filter(Boolean).join(', ')}</dd>
              </div>
            ) : null}
            {phone ? (
              <div>
                <dt>Telefono</dt>
                <dd>
                  <a href={`tel:${phone}`}>{phone}</a>
                </dd>
              </div>
            ) : null}
            {email ? (
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${email}`}>{email}</a>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {openingHours ? (
          <div className={styles.locationCard}>
            <h3>Orari</h3>
            <p style={{ whiteSpace: 'pre-line', margin: 0, color: 'var(--restaurant-muted)' }}>
              {openingHours}
            </p>
          </div>
        ) : (
          <div className={styles.locationCard}>
            <h3>Contatto</h3>
            <p style={{ margin: 0, color: 'var(--restaurant-muted)' }}>
              Scrivete o chiamate per informazioni e disponibilità.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
