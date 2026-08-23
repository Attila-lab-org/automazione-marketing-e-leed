const SHORT_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function slugifyBusinessName(name: string | null | undefined): string {
  const normalized = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'demo';
}

export function generateShortId(length = 8): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SHORT_ALPHABET[bytes[i]! % SHORT_ALPHABET.length];
  }
  return out;
}

export function makePublicSlug(name: string | null | undefined, shortId: string): string {
  return `${slugifyBusinessName(name)}-${shortId}`;
}
