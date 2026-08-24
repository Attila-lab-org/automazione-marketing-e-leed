/** Template-owned visual pack for Restaurant Premium V3.
 * See public/restaurant-premium-v3/assets/README.md for coherence rules.
 * Lead-owned imagery (hero/gallery/logo) overrides these paths when present.
 */

export const V3_ASSET_BASE = '/restaurant-premium-v3/assets';

function v3Svg(label: string, start: string, end: string, width = 1200, height = 800): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-pack="restaurant-premium-v3"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="82%" cy="18%" r="22%" fill="#fff" opacity=".08"/><text x="6%" y="90%" fill="#fff" opacity=".38" font-family="Georgia,serif" font-size="34">${label}</text></svg>`;
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
  headline: 'Un’esperienza che inizia prima ancora di sedersi a tavola.',
  subheadline:
    'Una presenza digitale raffinata, pensata per raccontare atmosfera, accoglienza e il desiderio di riservare un tavolo.',
  description:
    'Ogni dettaglio della pagina è pensato per evocare ospitalità contemporanea: luce, ritmo, silenzio e un invito chiaro a vivere il locale.',
  about:
    'Concept dimostrativo di vetrina digitale. I dati anagrafici del locale restano quelli reali; immagini e testi di atmosfera appartengono al template.',
  experience: [
    {
      title: 'Atmosfera',
      body: 'Uno spazio digitale che anticipa il tono del locale: caldo, contemporaneo, credibile.',
    },
    {
      title: 'Esperienza',
      body: 'Racconto visivo e tipografico che guida lo sguardo senza rumore, fino all’invito a prenotare.',
    },
    {
      title: 'Prenotazione semplice',
      body: 'Un invito chiaro, ripetuto nei punti giusti, per trasformare l’interesse in una prenotazione.',
    },
  ],
  storyHeadline: 'Il gusto incontra una presenza all’altezza.',
  storyBody:
    'Una vetrina online non sostituisce il locale: lo prepara. Qui la narrativa è silenziosa, fotografica, orientata a far desiderare di entrare.',
  digitalValueHeadline: 'Dal primo sguardo alla prenotazione',
  digitalValueBody:
    'Una pagina pensata per mobile e desktop, con gerarchia chiara e un percorso naturale verso il contatto.',
  finalCtaHeadline: 'Il prossimo tavolo è a un gesto.',
  finalCtaBody: 'Quando siete pronti, riservate il vostro momento.',
  ownerBridgeEyebrow: 'Per il proprietario',
  ownerBridgeHeadline: 'Ti piace come si presenta {name} online?',
  /** Used only when OWNER_OFFER_PRICE is set — see owner-commercial helpers. */
  ownerBridgeBody:
    'Questa non è ancora la versione definitiva: è un’anteprima. La trasformiamo nella presenza reale del tuo locale.',
  ownerBridgeMore: 'Vedi l’offerta completa',
  ownerHeadline: 'Cambia e rinnova la tua attività.',
  ownerOfferLabel: 'Presenza digitale completa',
  ownerBody:
    'Hai visto cosa può diventare il tuo locale online. Possiamo trasformare questa proposta in un sito reale, costruito sulla tua identità.',
  ownerCta: 'Parliamone',
  ownerCtaWhatsApp: 'Scrivici su WhatsApp',
  ownerCtaSite: 'Scopri Attila Lab',
  ownerMicro: 'Un tocco · Messaggio già pronto · Nessun impegno',
  cta: 'Prenota un tavolo',
  ctaShort: 'Prenota',
  ribbonTitle: 'Anteprima riservata',
  ribbonBody: 'Proposta dimostrativa · rinnova la tua presenza online',
  ribbonCta: 'Info',
  ribbonCtaWhatsApp: 'WhatsApp',
} as const;
