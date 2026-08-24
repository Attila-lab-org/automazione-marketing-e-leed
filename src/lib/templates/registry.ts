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
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from './restaurant-premium-v2';

export const KNOWN_RENDERER_KEYS = [
  RESTAURANT_PREMIUM_RENDERER_KEY,
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
] as const;
export type KnownRendererKey = (typeof KNOWN_RENDERER_KEYS)[number];

export class UnsupportedRendererError extends Error {
  constructor(layoutKey: string | null | undefined) {
    super(`Renderer non supportato: ${layoutKey ?? '(null)'}`);
    this.name = 'UnsupportedRendererError';
  }
}

export function resolveRendererKey(layoutKey: string | null | undefined): KnownRendererKey {
  if (layoutKey === RESTAURANT_PREMIUM_RENDERER_KEY) return RESTAURANT_PREMIUM_RENDERER_KEY;
  if (layoutKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) return RESTAURANT_PREMIUM_V2_RENDERER_KEY;
  throw new UnsupportedRendererError(layoutKey);
}

export type AnyDemoInstanceData = DemoInstanceData | DemoInstanceDataV2;
