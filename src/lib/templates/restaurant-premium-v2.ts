export const RESTAURANT_PREMIUM_V2_TEMPLATE_KEY = 'restaurant-premium';
export const RESTAURANT_PREMIUM_V2_RENDERER_KEY = 'restaurant-premium-v2';
export const RESTAURANT_PREMIUM_V2_COMPONENT_VERSION = '2.0.0';

export interface DemoBrandingV2 {
  business_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  hero_image: string | null;
  gallery: string[];
}

export interface DemoContentV2 {
  headline: string | null;
  subheadline: string | null;
  description: string | null;
  about: string | null;
  highlights: string[];
  cta: string | null;
}

export interface DemoContactV2 {
  phone: string | null;
  address: string | null;
  email: string | null;
  city: string | null;
  opening_hours: string | null;
}

export interface DemoSignalsV2 {
  rating: number | null;
  review_count: number | null;
}

export interface DemoInstanceDataV2 {
  branding: DemoBrandingV2;
  content: DemoContentV2;
  contact: DemoContactV2;
  signals: DemoSignalsV2;
}

export const RESTAURANT_PREMIUM_V2_DEFAULTS: DemoInstanceDataV2 = {
  branding: {
    business_name: null,
    logo_url: null,
    primary_color: '#1c1917',
    accent_color: '#d97706',
    hero_image: null,
    gallery: [],
  },
  content: {
    headline: null,
    subheadline: null,
    description: null,
    about: null,
    highlights: [],
    cta: 'Prenota un tavolo',
  },
  contact: {
    phone: null,
    address: null,
    email: null,
    city: null,
    opening_hours: null,
  },
  signals: {
    rating: null,
    review_count: null,
  },
};

export const RESTAURANT_PREMIUM_V2_SCHEMA = {
  renderer_key: RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  fields: [
    { key: 'business_name', group: 'branding', type: 'text', label: 'Nome attività' },
    { key: 'logo_url', group: 'branding', type: 'url', label: 'Logo URL' },
    { key: 'primary_color', group: 'branding', type: 'color', label: 'Colore primario' },
    { key: 'accent_color', group: 'branding', type: 'color', label: 'Colore accent' },
    { key: 'hero_image', group: 'branding', type: 'url', label: 'Hero image URL' },
    { key: 'gallery', group: 'branding', type: 'url_list', label: 'Gallery' },
    { key: 'headline', group: 'content', type: 'text', label: 'Headline' },
    { key: 'subheadline', group: 'content', type: 'text', label: 'Subheadline' },
    { key: 'description', group: 'content', type: 'textarea', label: 'Descrizione' },
    { key: 'about', group: 'content', type: 'textarea', label: 'About' },
    { key: 'highlights', group: 'content', type: 'text_list', label: 'Punti di forza' },
    { key: 'cta', group: 'content', type: 'text', label: 'CTA' },
    { key: 'phone', group: 'contact', type: 'text', label: 'Telefono' },
    { key: 'address', group: 'contact', type: 'text', label: 'Indirizzo' },
    { key: 'email', group: 'contact', type: 'text', label: 'Email' },
    { key: 'city', group: 'contact', type: 'text', label: 'Città' },
    { key: 'opening_hours', group: 'contact', type: 'textarea', label: 'Orari' },
    { key: 'rating', group: 'signals', type: 'number', label: 'Rating Google' },
    { key: 'review_count', group: 'signals', type: 'number', label: 'Recensioni Google' },
  ],
};
