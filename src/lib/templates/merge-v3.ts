import {
  RESTAURANT_PREMIUM_V3_DEFAULTS,
  type DemoInstanceDataV3,
} from './restaurant-premium-v3';

export interface LeadPrefillInputV3 {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  openingHours?: string | null;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

export function normalizeDemoDataV3(
  raw: unknown,
  fallback: DemoInstanceDataV3 = RESTAURANT_PREMIUM_V3_DEFAULTS,
): DemoInstanceDataV3 {
  const root = asRecord(raw);
  const branding = asRecord(root.branding);
  const content = asRecord(root.content);
  const contact = asRecord(root.contact);
  const signals = asRecord(root.signals);

  return {
    branding: {
      business_name:
        emptyToNull(typeof branding.business_name === 'string' ? branding.business_name : null) ??
        fallback.branding.business_name,
      logo_url:
        emptyToNull(typeof branding.logo_url === 'string' ? branding.logo_url : null) ??
        fallback.branding.logo_url,
      primary_color:
        emptyToNull(typeof branding.primary_color === 'string' ? branding.primary_color : null) ??
        fallback.branding.primary_color,
      accent_color:
        emptyToNull(typeof branding.accent_color === 'string' ? branding.accent_color : null) ??
        fallback.branding.accent_color,
      hero_image:
        emptyToNull(typeof branding.hero_image === 'string' ? branding.hero_image : null) ??
        fallback.branding.hero_image,
      gallery:
        branding.gallery !== undefined && asStringList(branding.gallery).length > 0
          ? asStringList(branding.gallery)
          : [...fallback.branding.gallery],
    },
    content: {
      headline:
        emptyToNull(typeof content.headline === 'string' ? content.headline : null) ??
        fallback.content.headline,
      subheadline:
        emptyToNull(typeof content.subheadline === 'string' ? content.subheadline : null) ??
        fallback.content.subheadline,
      description:
        emptyToNull(typeof content.description === 'string' ? content.description : null) ??
        fallback.content.description,
      about: emptyToNull(typeof content.about === 'string' ? content.about : null) ?? fallback.content.about,
      highlights:
        content.highlights !== undefined && asStringList(content.highlights).length > 0
          ? asStringList(content.highlights)
          : [...fallback.content.highlights],
      cta: emptyToNull(typeof content.cta === 'string' ? content.cta : null) ?? fallback.content.cta,
      cta_url:
        emptyToNull(typeof content.cta_url === 'string' ? content.cta_url : null) ??
        fallback.content.cta_url,
      owner_cta_label:
        emptyToNull(typeof content.owner_cta_label === 'string' ? content.owner_cta_label : null) ??
        fallback.content.owner_cta_label,
      owner_cta_url:
        emptyToNull(typeof content.owner_cta_url === 'string' ? content.owner_cta_url : null) ??
        fallback.content.owner_cta_url,
    },
    contact: {
      phone: emptyToNull(typeof contact.phone === 'string' ? contact.phone : null) ?? fallback.contact.phone,
      address:
        emptyToNull(typeof contact.address === 'string' ? contact.address : null) ?? fallback.contact.address,
      email: emptyToNull(typeof contact.email === 'string' ? contact.email : null) ?? fallback.contact.email,
      city: emptyToNull(typeof contact.city === 'string' ? contact.city : null) ?? fallback.contact.city,
      opening_hours:
        emptyToNull(typeof contact.opening_hours === 'string' ? contact.opening_hours : null) ??
        fallback.contact.opening_hours,
    },
    signals: {
      rating: typeof signals.rating === 'number' ? signals.rating : fallback.signals.rating,
      review_count:
        typeof signals.review_count === 'number' ? signals.review_count : fallback.signals.review_count,
    },
  };
}

export function prefillFromLeadV3(
  lead: LeadPrefillInputV3,
  defaults: DemoInstanceDataV3 = RESTAURANT_PREMIUM_V3_DEFAULTS,
): DemoInstanceDataV3 {
  return {
    branding: {
      ...defaults.branding,
      business_name: emptyToNull(lead.name) ?? defaults.branding.business_name,
      gallery: [...defaults.branding.gallery],
    },
    content: { ...defaults.content, highlights: [...defaults.content.highlights] },
    contact: {
      phone: emptyToNull(lead.phone) ?? defaults.contact.phone,
      address: emptyToNull(lead.address) ?? defaults.contact.address,
      email: emptyToNull(lead.email) ?? defaults.contact.email,
      city: emptyToNull(lead.city) ?? defaults.contact.city,
      opening_hours: emptyToNull(lead.openingHours) ?? defaults.contact.opening_hours,
    },
    signals: {
      rating: typeof lead.rating === 'number' ? lead.rating : defaults.signals.rating,
      review_count:
        typeof lead.reviewCount === 'number' ? lead.reviewCount : defaults.signals.review_count,
    },
  };
}

export function mergeDemoInstanceDataV3(args: {
  templateDefaults: unknown;
  lead: LeadPrefillInputV3;
  overrides: unknown;
}): DemoInstanceDataV3 {
  const defaults = normalizeDemoDataV3(args.templateDefaults, RESTAURANT_PREMIUM_V3_DEFAULTS);
  const prefilled = prefillFromLeadV3(args.lead, defaults);
  return normalizeDemoDataV3(args.overrides, prefilled);
}

export function applyEditorPatchV3(
  current: DemoInstanceDataV3,
  patch: Partial<{
    branding: Partial<DemoInstanceDataV3['branding']>;
    content: Partial<DemoInstanceDataV3['content']>;
    contact: Partial<DemoInstanceDataV3['contact']>;
    signals: Partial<DemoInstanceDataV3['signals']>;
  }>,
): DemoInstanceDataV3 {
  return normalizeDemoDataV3(
    {
      branding: { ...current.branding, ...patch.branding },
      content: { ...current.content, ...patch.content },
      contact: { ...current.contact, ...patch.contact },
      signals: { ...current.signals, ...patch.signals },
    },
    current,
  );
}
