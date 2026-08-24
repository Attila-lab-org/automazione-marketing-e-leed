import { wordmarkFromName } from '@/lib/templates/wordmark';
import type { DemoInstanceDataV2 } from '@/lib/templates/restaurant-premium-v2';

export type RestaurantPremiumV2Props = {
  data: DemoInstanceDataV2;
  compact?: boolean;
};

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span aria-label={`Rating ${rating.toFixed(1)} su 5`} className="text-amber-500">
      {'★'.repeat(Math.min(5, full))}
      <span className="text-stone-300">{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

/**
 * Restaurant Premium V2 — landing commerciale completa (baseline tecnica).
 * V1 resta congelato nel componente separato restaurant-premium.tsx.
 */
export default function RestaurantPremiumV2({ data, compact = false }: RestaurantPremiumV2Props) {
  const name = data.branding.business_name?.trim() || 'Attività';
  const wordmark = wordmarkFromName(name);
  const primary = data.branding.primary_color || '#1c1917';
  const accent = data.branding.accent_color || '#d97706';
  const logoUrl = data.branding.logo_url?.trim() || null;
  const hero = data.branding.hero_image?.trim() || null;
  const gallery = data.branding.gallery.filter(Boolean);
  const headline = data.content.headline?.trim() || name;
  const subheadline = data.content.subheadline?.trim() || null;
  const description = data.content.description?.trim() || data.content.about?.trim() || null;
  const highlights = data.content.highlights.filter(Boolean);
  const cta = data.content.cta?.trim() || 'Prenota un tavolo';
  const city = data.contact.city?.trim() || null;
  const address = data.contact.address?.trim() || null;
  const phone = data.contact.phone?.trim() || null;
  const email = data.contact.email?.trim() || null;
  const hours = data.contact.opening_hours?.trim() || null;
  const rating = typeof data.signals.rating === 'number' ? data.signals.rating : null;
  const reviews =
    typeof data.signals.review_count === 'number' ? data.signals.review_count : null;

  return (
    <div className={compact ? 'bg-white' : 'min-h-screen bg-stone-50'} style={{ color: primary }}>
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-10 max-w-[200px] object-contain" />
          ) : (
            <p className="text-xs font-semibold tracking-[0.24em]">{wordmark}</p>
          )}
          {phone ? (
            <a href={`tel:${phone}`} className="text-sm font-medium opacity-80 hover:opacity-100">
              {phone}
            </a>
          ) : null}
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-700"
          style={hero ? undefined : { background: `linear-gradient(135deg, ${primary}, ${accent})` }}
        />
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        ) : null}
        <div className={`relative mx-auto max-w-6xl px-6 ${compact ? 'py-12' : 'py-24 sm:py-32'}`}>
          {city ? (
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/70">{city}</p>
          ) : null}
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {headline}
          </h1>
          {subheadline ? (
            <p className="mt-4 max-w-2xl text-lg text-white/85">{subheadline}</p>
          ) : null}
          {rating !== null && reviews !== null ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/90">
              <Stars rating={rating} />
              <span>
                {rating.toFixed(1)} · {reviews.toLocaleString('it-IT')} recensioni Google
              </span>
            </div>
          ) : null}
          <div className="mt-8">
            <span
              className="inline-flex rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg"
              style={{ backgroundColor: accent }}
            >
              {cta}
            </span>
          </div>
        </div>
      </section>

      {description || highlights.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 py-16">
          {description ? (
            <p className="max-w-3xl text-lg leading-relaxed text-stone-600">{description}</p>
          ) : null}
          {highlights.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {highlights.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-stone-200 bg-white p-5 text-sm font-medium text-stone-800"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {gallery.length > 0 ? (
        <section className="border-y border-stone-200 bg-white py-16">
          <div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-56 w-full rounded-2xl object-cover" />
            ))}
          </div>
        </section>
      ) : null}

      {(rating !== null && reviews !== null) || phone || address ? (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 rounded-2xl border border-stone-200 bg-white p-8 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Prenota o contattaci</h2>
              {phone ? <p className="mt-3 text-stone-600">{phone}</p> : null}
              {address ? <p className="mt-1 text-stone-600">{address}</p> : null}
              {hours ? (
                <pre className="mt-4 whitespace-pre-wrap text-sm text-stone-500">{hours}</pre>
              ) : null}
            </div>
            {rating !== null && reviews !== null ? (
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Valutato su Google</h2>
                <div className="mt-3 flex items-center gap-3">
                  <Stars rating={rating} />
                  <span className="text-stone-600">
                    {rating.toFixed(1)} · {reviews.toLocaleString('it-IT')} recensioni
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <footer className="border-t border-stone-200 bg-white px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm text-stone-500">
          <p className="font-medium text-stone-800">{name}</p>
          {email ? <p>{email}</p> : null}
          <p className="pt-4 text-[11px] uppercase tracking-wide text-stone-300">
            Anteprima / concept dimostrativo · Restaurant Premium V2
          </p>
        </div>
      </footer>
    </div>
  );
}
