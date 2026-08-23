import { RESTAURANT_PREMIUM_DEFAULTS, type DemoInstanceData } from './restaurant-premium';

export interface LeadPrefillInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
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
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Normalizza un payload parziale. Non inventa campi assenti. */
export function normalizeDemoData(raw: unknown, fallback: DemoInstanceData = RESTAURANT_PREMIUM_DEFAULTS): DemoInstanceData {
  const root = asRecord(raw);
  const branding = asRecord(root.branding);
  const content = asRecord(root.content);
  const contact = asRecord(root.contact);

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
      images: branding.images !== undefined ? asStringList(branding.images) : [...fallback.branding.images],
    },
    content: {
      headline:
        emptyToNull(typeof content.headline === 'string' ? content.headline : null) ??
        fallback.content.headline,
      description:
        emptyToNull(typeof content.description === 'string' ? content.description : null) ??
        fallback.content.description,
      cta: emptyToNull(typeof content.cta === 'string' ? content.cta : null) ?? fallback.content.cta,
    },
    contact: {
      phone: emptyToNull(typeof contact.phone === 'string' ? contact.phone : null) ?? fallback.contact.phone,
      address:
        emptyToNull(typeof contact.address === 'string' ? contact.address : null) ?? fallback.contact.address,
      email: emptyToNull(typeof contact.email === 'string' ? contact.email : null) ?? fallback.contact.email,
      city: emptyToNull(typeof contact.city === 'string' ? contact.city : null) ?? fallback.contact.city,
    },
  };
}

/**
 * Prefill SOLO con dati lead già disponibili. Headline/descrizione/logo
 * restano null se assenti. CTA e colori restano i default del template.
 */
export function prefillFromLead(lead: LeadPrefillInput, defaults: DemoInstanceData = RESTAURANT_PREMIUM_DEFAULTS): DemoInstanceData {
  return {
    branding: {
      ...defaults.branding,
      business_name: emptyToNull(lead.name) ?? defaults.branding.business_name,
      images: [...defaults.branding.images],
    },
    content: {
      ...defaults.content,
    },
    contact: {
      phone: emptyToNull(lead.phone) ?? defaults.contact.phone,
      address: emptyToNull(lead.address) ?? defaults.contact.address,
      email: emptyToNull(lead.email) ?? defaults.contact.email,
      city: emptyToNull(lead.city) ?? defaults.contact.city,
    },
  };
}

/**
 * Merge: default versione template → prefill lead → override demo.
 * I null espliciti dell'override non inventano valori.
 */
export function mergeDemoInstanceData(args: {
  templateDefaults: unknown;
  lead: LeadPrefillInput;
  overrides: unknown;
}): DemoInstanceData {
  const defaults = normalizeDemoData(args.templateDefaults, RESTAURANT_PREMIUM_DEFAULTS);
  const prefilled = prefillFromLead(args.lead, defaults);
  return normalizeDemoData(args.overrides, prefilled);
}

export function applyEditorPatch(
  current: DemoInstanceData,
  patch: Partial<{
    branding: Partial<DemoInstanceData['branding']>;
    content: Partial<DemoInstanceData['content']>;
    contact: Partial<DemoInstanceData['contact']>;
  }>,
): DemoInstanceData {
  return normalizeDemoData(
    {
      branding: { ...current.branding, ...patch.branding },
      content: { ...current.content, ...patch.content },
      contact: { ...current.contact, ...patch.contact },
    },
    current,
  );
}
