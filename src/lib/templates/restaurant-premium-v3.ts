import {
  RESTAURANT_PREMIUM_V3_ASSETS,
  RESTAURANT_PREMIUM_V3_CONCEPT_COPY,
} from './v3-assets';

export const RESTAURANT_PREMIUM_V3_TEMPLATE_KEY = 'restaurant-premium';
export const RESTAURANT_PREMIUM_V3_RENDERER_KEY = 'restaurant-premium-v3';
export const RESTAURANT_PREMIUM_V3_COMPONENT_VERSION = '3.0.0';

export interface DemoBrandingV3 {
  business_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  hero_image: string | null;
  gallery: string[];
}

export interface DemoContentV3 {
  headline: string | null;
  subheadline: string | null;
  description: string | null;
  about: string | null;
  highlights: string[];
  cta: string | null;
  cta_url: string | null;
  owner_cta_label: string | null;
  owner_cta_url: string | null;
}

export interface DemoContactV3 {
  phone: string | null;
  address: string | null;
  email: string | null;
  city: string | null;
  opening_hours: string | null;
}

export interface DemoSignalsV3 {
  rating: number | null;
  review_count: number | null;
}

export interface DemoInstanceDataV3 {
  branding: DemoBrandingV3;
  content: DemoContentV3;
  contact: DemoContactV3;
  signals: DemoSignalsV3;
}

export const RESTAURANT_PREMIUM_V3_DEFAULTS: DemoInstanceDataV3 = {
  branding: {
    business_name: null,
    logo_url: null,
    primary_color: '#2c241e',
    accent_color: '#b86a45',
    hero_image: RESTAURANT_PREMIUM_V3_ASSETS.hero,
    gallery: [...RESTAURANT_PREMIUM_V3_ASSETS.gallery],
  },
  content: {
    headline: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.headline,
    subheadline: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.subheadline,
    description: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.description,
    about: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.about,
    highlights: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.experience.map((e) => e.title),
    cta: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.cta,
    cta_url: null,
    owner_cta_label: RESTAURANT_PREMIUM_V3_CONCEPT_COPY.ownerCta,
    owner_cta_url: null,
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

export const RESTAURANT_PREMIUM_V3_SCHEMA = {
  renderer_key: RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  fields: [
    { key: 'business_name', group: 'branding', type: 'text', label: 'Nome attività' },
    { key: 'logo_url', group: 'branding', type: 'url', label: 'Logo URL' },
    { key: 'primary_color', group: 'branding', type: 'color', label: 'Colore primario' },
    { key: 'accent_color', group: 'branding', type: 'color', label: 'Colore accent' },
    { key: 'hero_image', group: 'branding', type: 'url', label: 'Hero image URL' },
    { key: 'gallery', group: 'branding', type: 'url_list', label: 'Gallery' },
    { key: 'headline', group: 'content', type: 'text', label: 'Headline' },
    { key: 'subheadline', group: 'content', type: 'textarea', label: 'Subheadline' },
    { key: 'description', group: 'content', type: 'textarea', label: 'Descrizione' },
    { key: 'about', group: 'content', type: 'textarea', label: 'About' },
    { key: 'cta', group: 'content', type: 'text', label: 'CTA label' },
    { key: 'cta_url', group: 'content', type: 'url', label: 'CTA URL' },
    { key: 'owner_cta_label', group: 'content', type: 'text', label: 'Owner CTA label' },
    { key: 'owner_cta_url', group: 'content', type: 'url', label: 'Owner CTA URL' },
    { key: 'phone', group: 'contact', type: 'text', label: 'Telefono' },
    { key: 'address', group: 'contact', type: 'text', label: 'Indirizzo' },
    { key: 'email', group: 'contact', type: 'text', label: 'Email' },
    { key: 'city', group: 'contact', type: 'text', label: 'Città' },
    { key: 'opening_hours', group: 'contact', type: 'textarea', label: 'Orari' },
    { key: 'rating', group: 'signals', type: 'number', label: 'Rating Google', readOnly: true },
    { key: 'review_count', group: 'signals', type: 'number', label: 'Recensioni Google', readOnly: true },
  ],
};
