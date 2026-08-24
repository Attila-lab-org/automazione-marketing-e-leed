import { RESTAURANT_VERTICAL_TOKENS } from './restaurant-premium';

export interface TemplateCandidate {
  key: string;
  vertical: string | null;
  published: boolean;
}

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[|,/\s]+/)
    .map((t) => t.trim().replace(/-+/g, '_'))
    .filter(Boolean);
}

export function isRestaurantVertical(category: string | null | undefined): boolean {
  const t = tokens(category);
  return t.some((token) =>
    RESTAURANT_VERTICAL_TOKENS.some((m) => token === m || token.includes(m) || m.includes(token)),
  );
}

export function verticalMatches(
  templateVertical: string | null | undefined,
  leadCategory: string | null | undefined,
): boolean {
  const tv = (templateVertical ?? '').trim().toLowerCase();
  if (!tv) return false;
  if (tv === 'restaurant') return isRestaurantVertical(leadCategory);
  const leadTokens = tokens(leadCategory);
  return leadTokens.some((token) => token === tv || token.includes(tv) || tv.includes(token));
}

/**
 * Sceglie un template pubblicato compatibile col verticale del lead.
 * Nessun fallback cross-verticale: se non c'è match → null.
 */
export function pickCompatibleTemplateKey(
  leadCategory: string | null | undefined,
  available: readonly TemplateCandidate[],
): string | null {
  const published = available.filter((t) => t.published);
  if (published.length === 0) return null;

  const matched = published.find((t) => verticalMatches(t.vertical, leadCategory));
  return matched?.key ?? null;
}
