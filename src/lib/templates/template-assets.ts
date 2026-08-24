/** Template-owned decorative assets (SVG data URI) — no scraping, no third-party URLs. */

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const TEMPLATE_HERO_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1c1917"/>
      <stop offset="55%" stop-color="#44403c"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <circle cx="1280" cy="180" r="220" fill="#d97706" opacity="0.25"/>
  <circle cx="320" cy="720" r="280" fill="#fbbf24" opacity="0.12"/>
  <rect x="120" y="620" width="520" height="12" rx="6" fill="#fff" opacity="0.18"/>
  <rect x="120" y="660" width="340" height="8" rx="4" fill="#fff" opacity="0.12"/>
</svg>
`);

export const TEMPLATE_GALLERY_SVGS = [
  svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#292524"/><stop offset="1" stop-color="#78716c"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><text x="40" y="560" fill="#fff" opacity="0.35" font-family="Georgia, serif" font-size="28">Ambiente</text></svg>`),
  svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="a" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#78350f"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><text x="40" y="560" fill="#fff" opacity="0.35" font-family="Georgia, serif" font-size="28">Atmosfera</text></svg>`),
  svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#44403c"/><stop offset="1" stop-color="#1c1917"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><text x="40" y="560" fill="#fff" opacity="0.35" font-family="Georgia, serif" font-size="28">Dettaglio</text></svg>`),
];

/** Copy neutro di concept — non attribuisce fatti specifici al prospect. */
export const TEMPLATE_CONCEPT_COPY = {
  headline: 'Un luogo da raccontare online',
  subheadline:
    'Concept dimostrativo di presenza digitale: elegante, chiara e pensata per far conoscere la tua attività.',
  description:
    'Questa è un’anteprima di come potrebbe apparire una vetrina digitale curata: presentazione, atmosfera e contatti in un’unica pagina, senza sostituire le informazioni reali del tuo locale.',
  about:
    'Il layout è un concept dimostrativo. I dati anagrafici (nome, indirizzo, rating Google) restano quelli forniti; il resto è struttura e stile del template.',
  highlights: [
    'Presentazione chiara e professionale',
    'Focus su fiducia e recensioni Google',
    'Invito all’azione per contatto o prenotazione',
  ],
  cta: 'Prenota un tavolo',
};
