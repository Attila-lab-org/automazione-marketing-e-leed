import type { SecurityConsentChannel } from '@/lib/types/database';

export const CONSENT_CHANNELS: SecurityConsentChannel[] = ['phone', 'letter', 'in_person'];

export function isConsentChannel(value: unknown): value is SecurityConsentChannel {
  return value === 'phone' || value === 'letter' || value === 'in_person';
}

export function consentChannelLabel(channel: SecurityConsentChannel | null): string {
  if (channel === 'phone') return 'Al telefono';
  if (channel === 'letter') return 'Lettera firmata';
  if (channel === 'in_person') return 'Di persona';
  return 'Non annotato';
}
