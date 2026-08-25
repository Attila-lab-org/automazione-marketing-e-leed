/**
 * Owner commercial presentation — env-driven, no hardcoded studio fallbacks.
 * Secrets/values are never returned for UI status (READY/MISSING only).
 */

export type ConfigReadiness = 'READY' | 'MISSING';

export type OwnerCommercialStatus = {
  whatsapp: ConfigReadiness;
  contactUrl: ConfigReadiness;
  offerPrice: ConfigReadiness;
  showBridge: boolean;
};

export function getOwnerOfferPrice(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.OWNER_OFFER_PRICE?.trim();
  if (!raw) return null;
  // Reject empty / whitespace-only; allow "350€", "350", "da 350€"
  return raw;
}

export function isOwnerBridgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.OWNER_SHOW_BRIDGE ?? '').trim().toLowerCase();
  if (!v) {
    return Boolean(
      env.OWNER_WHATSAPP?.trim() ||
        env.OWNER_CONTACT_URL?.trim() ||
        env.NEXT_PUBLIC_OWNER_CONTACT_URL?.trim(),
    );
  }
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isOwnerWhatsAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OWNER_WHATSAPP?.trim());
}

export function isOwnerContactConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OWNER_CONTACT_URL?.trim() || env.NEXT_PUBLIC_OWNER_CONTACT_URL?.trim());
}

export function getOwnerCommercialStatus(
  env: NodeJS.ProcessEnv = process.env,
): OwnerCommercialStatus {
  return {
    whatsapp: isOwnerWhatsAppConfigured(env) ? 'READY' : 'MISSING',
    contactUrl: isOwnerContactConfigured(env) ? 'READY' : 'MISSING',
    offerPrice: getOwnerOfferPrice(env) ? 'READY' : 'MISSING',
    showBridge: isOwnerBridgeEnabled(env),
  };
}

/** Body/copy helpers — price only when configured. */
export function ownerBridgeBody(offerPrice: string | null, baseWithoutPrice: string): string {
  if (!offerPrice) return baseWithoutPrice;
  return `Questa non è ancora la versione definitiva: è un’anteprima. Da ${offerPrice} la trasformiamo nella presenza reale del tuo locale.`;
}

export function ownerFinalBody(offerPrice: string | null): string {
  if (!offerPrice) {
    return 'Hai visto cosa può diventare il tuo locale online. Possiamo trasformare questa proposta in un sito reale, costruito sulla tua identità.';
  }
  return `Hai visto cosa può diventare il tuo locale online. Da ${offerPrice} possiamo trasformare questa proposta in un sito reale, costruito sulla tua identità.`;
}

export function ownerRibbonBody(offerPrice: string | null): string {
  if (!offerPrice) return 'Proposta dimostrativa · rinnova la tua presenza online';
  return `Proposta dimostrativa · rinnova la tua presenza online da ${offerPrice}`;
}
