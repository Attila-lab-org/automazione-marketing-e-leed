import { wordmarkFromName } from '@/lib/templates/wordmark';
import type { DemoInstanceDataV2 } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V2_DEFAULTS } from '@/lib/templates/restaurant-premium-v2';

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
 * Restaurant Premium V2 — landing commerciale completa.
 * Con dati lead scarsi usa comunque asset/copy di template (mai inventati sul prospect).
 */
export default function RestaurantPremiumV2({ data, compact = false }: RestaurantPremiumV2Props) {
  const defaults = RESTAURANT_PREMIUM_V2_DEFAULTS;
  const name = data.branding.business_name?.trim() || 'Attività';
  const wordmark = wordmarkFromName(name);
  const primary = data.branding.primary_color || defaults.branding.primary_color || '#1c1917';
  const accent = data.branding.accent_color || defaults.branding.accent_color || '#d97706';
  const logoUrl = data.branding.logo_url?.trim() || null;
  const hero =
    data.branding.hero_image?.trim() || defaults.branding.hero_image || null;
  const gallery =
    data.branding.gallery.filter(Boolean).length > 0
      ? data.branding.gallery.filter(Boolean)
      : defaults.branding.gallery;
  const headline =
    data.content.headline?.trim() || defaults.content.headline || name;
  const subheadline =
    data.content.subheadline?.trim() || defaults.content.subheadline;
  const description =
    data.content.description?.trim() ||
    data.content.about?.trim() ||
    defaults.content.description;
  const about = data.content.about?.trim() || defaults.content.about;
  const highlights =
    data.content.highlights.filter(Boolean).length > 0
      ? data.content.highlights.filter(Boolean)
      : defaults.content.highlights;
  const cta = data.content.cta?.trim() || defaults.content.cta || 'Prenota un tavolo';
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
          <nav className="hidden gap-6 text-sm text-stone-500 sm:flex">
            <span>Esperienza</span>
            <span>Ambiente</span>
            <span>Contatti</span>
          </nav>
          {phone ? (
            <a href={`tel:${phone}`} className="text-sm font-medium opacity-80 hover:opacity-100">
              {phone}
            </a>
          ) : (
            <span className="text-sm font-medium" style={{ color: accent }}>
              {cta}
            </span>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-stone-900" />
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
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
          ) : (
            <p className="mt-6 text-sm text-white/70">Concept dimostrativo · fiducia e presenza digitale</p>
          )}
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

      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Presentazione</p>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-stone-600">{description}</p>
        {about ? <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-500">{about}</p> : null}
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
      </section>

      <section className="border-y border-stone-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-lg font-semibold text-stone-900">Ambiente &amp; atmosfera</h2>
          <p className="mt-2 text-sm text-stone-500">
            Immagini di template (concept). Non rappresentano foto del locale.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src.slice(0, 48)} src={src} alt="" className="h-56 w-full rounded-2xl object-cover" />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 rounded-2xl border border-stone-200 bg-white p-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Perché scegliere questo concept</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Una pagina unica che combina fiducia Google, presentazione e contatto — pronta da
              personalizzare con i dati reali della tua attività.
            </p>
            <span
              className="mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {cta}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Informazioni</h2>
            {phone ? <p className="mt-3 text-stone-600">{phone}</p> : null}
            {address ? <p className="mt-1 text-stone-600">{address}</p> : null}
            {city && !address ? <p className="mt-1 text-stone-600">{city}</p> : null}
            {hours ? (
              <pre className="mt-4 whitespace-pre-wrap text-sm text-stone-500">{hours}</pre>
            ) : null}
            {rating !== null && reviews !== null ? (
              <div className="mt-4 flex items-center gap-3">
                <Stars rating={rating} />
                <span className="text-stone-600">
                  {rating.toFixed(1)} · {reviews.toLocaleString('it-IT')} recensioni Google
                </span>
              </div>
            ) : null}
            {!phone && !address && !hours ? (
              <p className="mt-3 text-sm text-stone-500">Contatti disponibili dopo enrichment Google.</p>
            ) : null}
          </div>
        </div>
      </section>

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
