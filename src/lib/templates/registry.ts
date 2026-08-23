/**
 * Registry renderer Master Template.
 * Il codice React vive qui, mai nel database.
 *
 * Decisione Kimi (docs/decisions/001-kimi-role.md):
 * Kimi NON è Browser Website Analysis. Nessun renderer dipende da Kimi.
 */

import {
  RESTAURANT_PREMIUM_RENDERER_KEY,
  type DemoInstanceData,
} from './restaurant-premium';

export const KNOWN_RENDERER_KEYS = [RESTAURANT_PREMIUM_RENDERER_KEY] as const;
export type KnownRendererKey = (typeof KNOWN_RENDERER_KEYS)[number];

export function resolveRendererKey(layoutKey: string | null | undefined): KnownRendererKey {
  if (layoutKey === RESTAURANT_PREMIUM_RENDERER_KEY) return RESTAURANT_PREMIUM_RENDERER_KEY;
  return RESTAURANT_PREMIUM_RENDERER_KEY;
}

export interface ResolvedDemoView {
  rendererKey: KnownRendererKey;
  data: DemoInstanceData;
  templateName: string;
  templateVersion: number;
  publicSlug: string;
}
