/** Template-owned visual pack for Restaurant Premium V3.
 * See public/restaurant-premium-v3/assets/README.md for coherence rules.
 * Lead-owned imagery (hero/gallery/logo) overrides these paths when present.
 */

export const V3_ASSET_BASE = '/restaurant-premium-v3/assets';

function v3Svg(label: string, start: string, end: string, width = 1200, height = 800): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-pack="restaurant-premium-v3" data-scene="${label}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset=".58" stop-color="${end}"/><stop offset="1" stop-color="#17120f"/></linearGradient><radialGradient id="light" cx="72%" cy="24%" r="55%"><stop stop-color="#fff4dc" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#light)"/><ellipse cx="30%" cy="76%" rx="34%" ry="18%" fill="#120d0a" opacity=".5" filter="url(#blur)"/><circle cx="82%" cy="18%" r="18%" fill="#fff8e9" opacity=".1"/><path d="M0 ${height * 0.72} C ${width * 0.25} ${height * 0.58}, ${width * 0.52} ${height * 0.94}, ${width} ${height * 0.66} V ${height} H0Z" fill="#0d0907" opacity=".32"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const V3_HERO_FALLBACK = v3Svg('restaurant-premium-v3', '#211915', '#9a5538', 1600, 900);
const V3_GALLERY_FALLBACKS = [
  v3Svg('Ambiente', '#2c241e', '#80604f'),
  v3Svg('Atmosfera', '#5f3328', '#c17b54'),
  v3Svg('Dettagli', '#25201d', '#69564c'),
] as const;

/** Placeholder concept pack — mixed locations; replace with a coherent pack when curated. */
export const RESTAURANT_PREMIUM_V3_ASSETS = {
  hero: V3_HERO_FALLBACK,
  interior: V3_GALLERY_FALLBACKS[0],
  foodDetail: V3_GALLERY_FALLBACKS[2],
  table: V3_GALLERY_FALLBACKS[1],
  atmosphere: V3_GALLERY_FALLBACKS[0],
  gallery: [
    V3_GALLERY_FALLBACKS[0],
    V3_GALLERY_FALLBACKS[1],
    V3_GALLERY_FALLBACKS[2],
  ],
} as const;

export const RESTAURANT_PREMIUM_V3_CONCEPT_COPY = {
  headline: 'Il locale, chiaro dal primo sguardo. Prenota in un gesto.',
  subheadline:
    'Foto, recensioni e recapiti in evidenza: l’ospite capisce subito dove si trova e come riservare un tavolo.',
  description:
    'Una pagina pensata per il telefono: si capisce in pochi secondi chi siete, dove siete e come prenotare.',
  about:
    'I recapiti e le recensioni sono quelli reali del locale. Lo stile visivo è la proposta: chiaro, rapido da capire, pronto per prenotare.',
  experience: [
    {
      title: 'Atmosfera',
      body: 'Foto e testi che fanno capire subito il carattere del locale, senza rumore visivo.',
    },
    {
      title: 'Informazioni chiare',
      body: 'Indirizzo, recensioni e recapiti visibili: l’ospite sa dove siete e come raggiungervi.',
    },
    {
      title: 'Prenotazione in un gesto',
      body: 'Un bottone evidente, ripetuto nei punti giusti, per prenotare dal telefono in pochi secondi.',
    },
  ],
  storyHeadline: 'Il locale merita una vetrina all’altezza del tavolo.',
  storyBody:
    'Il sito non sostituisce l’esperienza: la anticipa. Si capisce chi siete, dove siete e come prenotare, prima ancora di entrare.',
  digitalValueHeadline: 'Dal primo sguardo alla prenotazione',
  digitalValueBody:
    'Pensato per il telefono: gerarchia chiara, recensioni in evidenza e un percorso naturale verso il contatto.',
  finalCtaHeadline: 'Il prossimo tavolo è a un gesto.',
  finalCtaBody: 'Quando siete pronti, riservate il vostro momento.',
  ownerBridgeEyebrow: 'Per il proprietario',
  ownerBridgeHeadline: 'Ti piace come si presenta {name} online?',
  /** Used only when OWNER_OFFER_PRICE is set — see owner-commercial helpers. */
  ownerBridgeBody:
    'Questa non è ancora la versione definitiva: è un’anteprima. La trasformiamo nella presenza reale del tuo locale.',
  ownerBridgeMore: 'Vedi l’offerta completa',
  ownerHeadline: 'Il tuo nuovo sito, pronto a lavorare.',
  ownerOfferLabel: 'Sito professionale completo',
  ownerBody:
    'Hai visto cosa può diventare il tuo locale online. Possiamo trasformare questa proposta in un sito reale, costruito sulla tua identità.',
  ownerContactHow:
    'Come contattarmi: un messaggio su WhatsApp o una chiamata. Ti rispondo io, senza moduli e senza attese.',
  ownerCta: 'Parliamone',
  ownerCtaWhatsApp: 'Scrivimi su WhatsApp',
  ownerCtaPhone: 'Chiamami ora',
  ownerCtaSite: 'Scopri Attila Lab',
  ownerMicro: 'Da 350 € · Consegna in 24 ore · Nessun impegno',
  cta: 'Prenota un tavolo',
  ctaShort: 'Prenota',
  ribbonTitle: 'Anteprima riservata',
  ribbonBody: 'Proposta dimostrativa · rinnova la tua presenza online',
  ribbonCta: 'Info',
  ribbonCtaWhatsApp: 'WhatsApp',
} as const;
