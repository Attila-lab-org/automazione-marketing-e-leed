import { wordmarkFromName } from "@/lib/templates/wordmark";
import type { DemoInstanceData } from "@/lib/templates/restaurant-premium";

export type RestaurantPremiumProps = {
  data: DemoInstanceData;
  /** Preview compatta in editor (niente min-height full viewport). */
  compact?: boolean;
};

/**
 * Baseline tecnica Restaurant Premium.
 * Non è il design commerciale definitivo: certifica Template → Instance → Preview.
 */
export default function RestaurantPremium({ data, compact = false }: RestaurantPremiumProps) {
  const name = data.branding.business_name?.trim() || "Attività";
  const wordmark = wordmarkFromName(name);
  const primary = data.branding.primary_color || "#1c1917";
  const accent = data.branding.accent_color || "#d97706";
  const logoUrl = data.branding.logo_url?.trim() || null;
  const images = data.branding.images.filter(Boolean);
  const headline = data.content.headline?.trim() || null;
  const description = data.content.description?.trim() || null;
  const cta = data.content.cta?.trim() || "Prenota un tavolo";
  const city = data.contact.city?.trim() || null;
  const address = data.contact.address?.trim() || null;
  const phone = data.contact.phone?.trim() || null;
  const email = data.contact.email?.trim() || null;

  return (
    <div
      className={compact ? "bg-white" : "min-h-screen bg-white"}
      style={{ color: primary }}
    >
      <header className="border-b border-stone-200 px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-10 max-w-[180px] object-contain" />
          ) : (
            <p
              className="text-sm font-semibold tracking-[0.22em]"
              aria-label={`Wordmark ${name}`}
            >
              {wordmark}
            </p>
          )}
          {phone ? (
            <a href={`tel:${phone}`} className="text-xs tracking-wide opacity-70 hover:opacity-100">
              {phone}
            </a>
          ) : null}
        </div>
      </header>

      <section className="px-6 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-5xl">
          {city ? (
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-stone-400">
              {city}
            </p>
          ) : null}
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {headline ?? name}
          </h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600">
              {description}
            </p>
          ) : null}
          <div className="mt-8">
            <span
              className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {cta}
            </span>
          </div>
        </div>
      </section>

      {images.length > 0 ? (
        <section className="border-t border-stone-100 px-6 py-12 sm:px-10">
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
            {images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="h-56 w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="border-t border-stone-200 px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 text-sm text-stone-500">
          <p className="font-medium text-stone-800">{name}</p>
          {address ? <p>{address}</p> : null}
          {email ? <p>{email}</p> : null}
          <p className="pt-4 text-[11px] uppercase tracking-wide text-stone-300">
            Anteprima tecnica · Restaurant Premium v1
          </p>
        </div>
      </footer>
    </div>
  );
}
