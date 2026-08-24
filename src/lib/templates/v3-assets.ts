/** Public paths for Restaurant Premium V3 template-owned visual pack. */

export const V3_ASSET_BASE = '/restaurant-premium-v3/assets';

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
    'Questa è una proposta dimostrativa. Possiamo personalizzarla completamente sulla tua identità, sui tuoi contenuti e sui tuoi obiettivi.',
  ownerCta: 'Parliamone',
  cta: 'Prenota un tavolo',
  ribbonTitle: 'Anteprima riservata',
  ribbonBody: 'Concept dimostrativo realizzato per mostrarti una possibile nuova presenza digitale.',
  ribbonCta: 'Richiedi la versione completa',
} as const;
