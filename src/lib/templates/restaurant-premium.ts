export const RESTAURANT_PREMIUM_TEMPLATE_KEY = 'restaurant-premium';
export const RESTAURANT_PREMIUM_RENDERER_KEY = 'restaurant-premium';
export const RESTAURANT_PREMIUM_COMPONENT_VERSION = '1.0.0';

export type TemplateFieldGroup = 'branding' | 'content' | 'contact';
export type TemplateFieldType = 'text' | 'textarea' | 'url' | 'color' | 'url_list';

export interface TemplateFieldSpec {
  key: string;
  group: TemplateFieldGroup;
  type: TemplateFieldType;
  label: string;
}

export const RESTAURANT_PREMIUM_FIELDS: readonly TemplateFieldSpec[] = [
  { key: 'business_name', group: 'branding', type: 'text', label: 'Nome attività' },
  { key: 'logo_url', group: 'branding', type: 'url', label: 'Logo URL' },
  { key: 'primary_color', group: 'branding', type: 'color', label: 'Colore primario' },
  { key: 'accent_color', group: 'branding', type: 'color', label: 'Colore accent' },
  { key: 'images', group: 'branding', type: 'url_list', label: 'Immagini' },
  { key: 'headline', group: 'content', type: 'text', label: 'Headline' },
  { key: 'description', group: 'content', type: 'textarea', label: 'Descrizione' },
  { key: 'cta', group: 'content', type: 'text', label: 'CTA' },
  { key: 'phone', group: 'contact', type: 'text', label: 'Telefono' },
  { key: 'address', group: 'contact', type: 'text', label: 'Indirizzo' },
  { key: 'email', group: 'contact', type: 'text', label: 'Email' },
  { key: 'city', group: 'contact', type: 'text', label: 'Città' },
];

export const RESTAURANT_PREMIUM_SCHEMA = {
  renderer_key: RESTAURANT_PREMIUM_RENDERER_KEY,
  fields: RESTAURANT_PREMIUM_FIELDS,
};

export interface DemoBranding {
  business_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  images: string[];
}

export interface DemoContent {
  headline: string | null;
  description: string | null;
  cta: string | null;
}

export interface DemoContact {
  phone: string | null;
  address: string | null;
  email: string | null;
  city: string | null;
}

export interface DemoInstanceData {
  branding: DemoBranding;
  content: DemoContent;
  contact: DemoContact;
}

export const RESTAURANT_PREMIUM_DEFAULTS: DemoInstanceData = {
  branding: {
    business_name: null,
    logo_url: null,
    primary_color: '#1c1917',
    accent_color: '#d97706',
    images: [],
  },
  content: {
    headline: null,
    description: null,
    cta: 'Prenota un tavolo',
  },
  contact: {
    phone: null,
    address: null,
    email: null,
    city: null,
  },
};

/** Verticale food compatibile con Restaurant Premium. Estendibile per altri template. */
export const RESTAURANT_VERTICAL_TOKENS = [
  'restaurant',
  'italian_restaurant',
  'seafood_restaurant',
  'food',
  'meal_takeaway',
  'meal_delivery',
  'cafe',
  'bakery',
  'bar',
  'ristorante',
  'ristoranti',
] as const;
