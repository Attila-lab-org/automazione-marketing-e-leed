/** Template-owned visual pack for Restaurant Premium V3.
 * See public/restaurant-premium-v3/assets/README.md for coherence rules.
 * Lead-owned imagery (hero/gallery/logo) overrides these paths when present.
 */

export const V3_ASSET_BASE = '/restaurant-premium-v3/assets';

/** Placeholder concept pack — mixed locations; replace with a coherent pack when curated. */
export const RESTAURANT_PREMIUM_V3_ASSETS = {
  hero: `${V3_ASSET_BASE}/hero.jpg`,
  interior: `${V3_ASSET_BASE}/interior.jpg`,
  foodDetail: `${V3_ASSET_BASE}/food-detail.jpg`,
  table: `${V3_ASSET_BASE}/table.jpg`,
  atmosphere: `${V3_ASSET_BASE}/atmosphere.jpg`,
  gallery: [
    `${V3_ASSET_BASE}/gallery-1.jpg`,
    `${V3_ASSET_BASE}/gallery-2.jpg`,
    `${V3_ASSET_BASE}/gallery-3.jpg`,
    `${V3_ASSET_BASE}/food-detail.jpg`,
    `${V3_ASSET_BASE}/table.jpg`,
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
      body: 'Una call to action chiara, ripetuta nei punti giusti, per trasformare interesse in tavolo riservato.',
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
  ownerHeadline: 'Ti piacerebbe una presenza digitale così per il tuo locale?',
  ownerBody:
    'Questa è solo l’anteprima. Un tap e ne parliamo: ti prepariamo la versione completa sul tuo brand, senza moduli lunghi.',
  ownerCta: 'Parliamone',
  ownerCtaWhatsApp: 'Scrivici su WhatsApp',
  ownerCtaSite: 'Apri il sito Attila Lab',
  ownerMicro: 'Risposta rapida · Nessun impegno · Demo già pronta',
  cta: 'Prenota un tavolo',
  ribbonTitle: 'Anteprima riservata',
  ribbonBody: 'Concept dimostrativo realizzato per mostrarti una possibile nuova presenza digitale.',
  ribbonCta: 'Richiedi la versione completa',
  ribbonCtaWhatsApp: 'WhatsApp',
} as const;
