import { describe, expect, it } from 'vitest';

import {
  findDuplicates,
  nameSimilarity,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  type DedupeCandidate,
  type DedupeLeadRecord,
} from '../../src/lib/domain/dedupe';

function existing(overrides: Partial<DedupeLeadRecord> = {}): DedupeLeadRecord {
  return {
    id: 'lead-1',
    googlePlaceId: null,
    name: 'Ristorante Rossi',
    normalizedDomain: null,
    normalizedPhone: null,
    normalizedEmail: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    googlePlaceId: null,
    name: 'Nuova Attività',
    websiteUrl: null,
    phone: null,
    email: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

describe('normalizzazione', () => {
  it('normalizeDomain: lowercase, no schema, no www, no path', () => {
    expect(normalizeDomain('HTTPS://WWW.Example.COM/path?q=1')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
    expect(normalizeDomain('  ')).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });

  it('normalizePhone: solo cifre, trunk 00 → internazionale', () => {
    expect(normalizePhone('+39 02 123 4567')).toBe('39021234567');
    expect(normalizePhone('0039 02 1234567')).toBe('39021234567');
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('normalizeEmail: lowercase trim', () => {
    expect(normalizeEmail('  Info@Example.COM ')).toBe('info@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
  });
});

describe('findDuplicates — segnali §13.2 in ordine', () => {
  it('segnale 1: google_place_id → DUPLICATE', () => {
    const result = findDuplicates(
      candidate({ googlePlaceId: 'abc123' }),
      [existing({ id: 'lead-42', googlePlaceId: 'abc123' })],
    );
    expect(result.verdict).toBe('DUPLICATE');
    expect(result.strongMatchLeadId).toBe('lead-42');
    expect(result.signals[0].kind).toBe('GOOGLE_PLACE_ID');
    expect(result.signals[0].order).toBe(1);
  });

  it('segnale 2: normalized_domain → DUPLICATE (anche con www/schema diversi)', () => {
    const result = findDuplicates(
      candidate({ websiteUrl: 'https://www.ristoranterossi.it/menu' }),
      [existing({ normalizedDomain: 'ristoranterossi.it' })],
    );
    expect(result.verdict).toBe('DUPLICATE');
    expect(result.signals[0].kind).toBe('NORMALIZED_DOMAIN');
  });

  it('segnale 3: normalized_phone → DUPLICATE', () => {
    const result = findDuplicates(
      candidate({ phone: '+39 02 1234567' }),
      [existing({ normalizedPhone: '39021234567' })],
    );
    expect(result.verdict).toBe('DUPLICATE');
    expect(result.signals[0].kind).toBe('NORMALIZED_PHONE');
  });

  it('segnale 4: normalized_email → DUPLICATE', () => {
    const result = findDuplicates(
      candidate({ email: 'Info@Example.com' }),
      [existing({ normalizedEmail: 'info@example.com' })],
    );
    expect(result.verdict).toBe('DUPLICATE');
    expect(result.signals[0].kind).toBe('NORMALIZED_EMAIL');
  });

  it('segnale 5: fuzzy name + distanza → POSSIBLE_DUPLICATE, MAI merge automatico', () => {
    const result = findDuplicates(
      candidate({ name: 'Ristorante Rossi', lat: 45.4642, lng: 9.19 }),
      [existing({ id: 'lead-9', name: 'Ristorante Rossi', lat: 45.4643, lng: 9.1901 })],
    );
    expect(result.verdict).toBe('POSSIBLE_DUPLICATE');
    expect(result.strongMatchLeadId).toBeNull();
    expect(result.signals[0].kind).toBe('FUZZY_NAME_GEO');
    expect(result.signals[0].strong).toBe(false);
  });

  it('fuzzy da solo (nome simile ma lontano) → NEW', () => {
    const result = findDuplicates(
      candidate({ name: 'Ristorante Rossi', lat: 45.4642, lng: 9.19 }),
      [existing({ name: 'Ristorante Rossi', lat: 41.9028, lng: 12.4964 })], // Roma
    );
    expect(result.verdict).toBe('NEW');
  });

  it('nameSimilarity è simmetrica e premia nomi identici', () => {
    expect(nameSimilarity('Ristorante Rossi', 'ristorante rossi')).toBe(1);
    expect(nameSimilarity('Bar Roma', 'Bar Milano')).toBeLessThan(0.5);
  });

  it('candidato senza alcun match → NEW', () => {
    const result = findDuplicates(candidate(), [existing()]);
    expect(result.verdict).toBe('NEW');
    expect(result.signals).toEqual([]);
  });

  it('i segnali sono ordinati per priorità §13.2', () => {
    const result = findDuplicates(
      candidate({ email: 'a@example.com', googlePlaceId: 'pid-1' }),
      [
        existing({ id: 'lead-email', normalizedEmail: 'a@example.com' }),
        existing({ id: 'lead-place', googlePlaceId: 'pid-1' }),
      ],
    );
    expect(result.signals.map((s) => s.order)).toEqual([1, 4]);
    expect(result.strongMatchLeadId).toBe('lead-place');
  });
});
