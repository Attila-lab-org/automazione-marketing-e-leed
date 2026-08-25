import type { InboundClassification } from '@/lib/ai/commercial/schemas';
import type { CommercialPlaybook } from './playbook';

export type NegotiationGuidance = {
  allowed: boolean;
  standardPrice: number | null;
  floorPrice: number | null;
  prospectOffer: number | null;
  responsePrice: number | null;
  currency: 'EUR';
  action: 'HIDE_PRICE' | 'COMMUNICATE_RANGE' | 'ACCEPT' | 'COUNTER' | 'ESCALATE';
  reason: string;
};

function money(value: number): number {
  return Math.max(0, Math.round(value));
}

export function extractEuroAmount(text: string): number | null {
  const matches = [...text.matchAll(/(?:€\s*|(?:euro|eur)\s*)?(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)?/gi)];
  for (const match of matches) {
    const value = Number(match[1]?.replace(',', '.'));
    if (Number.isFinite(value) && value >= 50) return money(value);
  }
  return null;
}

export function resolveNegotiationGuidance(args: {
  playbook: CommercialPlaybook;
  classification: InboundClassification;
  inboundText: string;
}): NegotiationGuidance {
  const { playbook, classification } = args;
  const standardPrice = playbook.pricing.max != null ? money(playbook.pricing.max) : null;
  const configuredFloor = playbook.pricing.min != null ? money(playbook.pricing.min) : null;
  const discountFloor =
    standardPrice != null && playbook.discount.maxAutomatic != null
      ? money(standardPrice * (1 - Math.max(0, Math.min(100, playbook.discount.maxAutomatic)) / 100))
      : null;
  const floorPrice =
    configuredFloor != null && discountFloor != null
      ? Math.max(configuredFloor, discountFloor)
      : configuredFloor ?? discountFloor;
  const prospectOffer = extractEuroAmount(args.inboundText);
  const pricingConfigured =
    playbook.pricing.aiMayCommunicate && standardPrice != null && floorPrice != null;

  if (!pricingConfigured) {
    return {
      allowed: false,
      standardPrice,
      floorPrice,
      prospectOffer,
      responsePrice: null,
      currency: 'EUR',
      action: classification.pricing || classification.discountAsk ? 'ESCALATE' : 'HIDE_PRICE',
      reason: 'pricing_not_configured',
    };
  }

  if (!classification.discountAsk) {
    return {
      allowed: true,
      standardPrice,
      floorPrice,
      prospectOffer,
      responsePrice: standardPrice,
      currency: 'EUR',
      action: 'COMMUNICATE_RANGE',
      reason: 'authorized_price_range',
    };
  }

  if (!playbook.discount.allowed) {
    return {
      allowed: false,
      standardPrice,
      floorPrice,
      prospectOffer,
      responsePrice: null,
      currency: 'EUR',
      action: 'ESCALATE',
      reason: 'discount_not_authorized',
    };
  }

  if (prospectOffer != null && prospectOffer >= floorPrice) {
    return {
      allowed: true,
      standardPrice,
      floorPrice,
      prospectOffer,
      responsePrice: prospectOffer,
      currency: 'EUR',
      action: 'ACCEPT',
      reason: 'offer_within_authorized_floor',
    };
  }

  return {
    allowed: true,
    standardPrice,
    floorPrice,
    prospectOffer,
    responsePrice: floorPrice,
    currency: 'EUR',
    action: 'COUNTER',
    reason: prospectOffer == null ? 'discount_without_amount' : 'offer_below_floor',
  };
}
