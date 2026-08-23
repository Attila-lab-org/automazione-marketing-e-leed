/**
 * Dedupe — MASTER_SPEC §13.2.
 *
 * Ordine segnali:
 *  1. google_place_id (UNIQUE per workspace)
 *  2. normalized_domain
 *  3. normalized_phone
 *  4. normalized_email
 *  5. fuzzy name + distanza geografica — SOLO segnale: mai merge automatico
 *     basato sul solo fuzzy match.
 */

export const DEDUPE_SIGNAL_KINDS = [
  'GOOGLE_PLACE_ID',
  'NORMALIZED_DOMAIN',
  'NORMALIZED_PHONE',
  'NORMALIZED_EMAIL',
  'FUZZY_NAME_GEO',
] as const;
export type DedupeSignalKind = (typeof DEDUPE_SIGNAL_KINDS)[number];

export interface DedupeSignal {
  kind: DedupeSignalKind;
  /** Ordine ufficiale §13.2 (1-5). */
  order: number;
  matchedLeadId: string;
  detail: string;
  /** true = segnale forte (1-4); false = solo informativo (5, fuzzy). */
  strong: boolean;
}

export type DedupeVerdict = 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'NEW';

export interface DedupeResult {
  verdict: DedupeVerdict;
  signals: DedupeSignal[];
  /** Lead esistente con match forte (segnali 1-4), se presente. */
  strongMatchLeadId: string | null;
}

/** Record minimo richiesto per il confronto dedupe. */
export interface DedupeLeadRecord {
  id: string;
  googlePlaceId: string | null;
  name: string;
  normalizedDomain: string | null;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DedupeCandidate {
  googlePlaceId: string | null;
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
}

// ---------------------------------------------------------------------------
// Normalizzazione (coerente con le colonne leads.* di migration plan §5.1)
// ---------------------------------------------------------------------------

/** Lowercase, senza schema, senza `www.`, senza path/query. */
export function normalizeDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  let raw = websiteUrl.trim().toLowerCase();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    let host = url.hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/** Solo cifre, formato E.164 senza `+` (migration plan §5.1). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  // Normalizza il trunk internazionale italiano comune: 0039 → 39.
  if (digits.startsWith('00')) return digits.slice(2);
  return digits;
}

/** Lowercase trim (migration plan §5.1). */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.includes('@') ? normalized : null;
}

// ---------------------------------------------------------------------------
// Fuzzy name + distanza (segnale 5 — solo informativo)
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritics U+0300–U+036F
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
  return set;
}

/** Coefficiente di Dice sui bigrammi: 0..1, deterministico. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const g of ba) if (bb.has(g)) intersection += 1;
  return (2 * intersection) / (ba.size + bb.size);
}

/** Distanza haversine in metri. null se coordinate incomplete. */
export function geoDistanceMeters(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface FuzzyThresholds {
  /** Similarità nome minima per il segnale fuzzy (default 0.8). */
  minNameSimilarity: number;
  /** Distanza massima in metri per il segnale fuzzy (default 500). */
  maxDistanceMeters: number;
}

export const DEFAULT_FUZZY_THRESHOLDS: FuzzyThresholds = {
  minNameSimilarity: 0.8,
  maxDistanceMeters: 500,
};

// ---------------------------------------------------------------------------
// Motore dedupe
// ---------------------------------------------------------------------------

/**
 * Confronta un candidato con i lead esistenti del workspace applicando i
 * segnali §13.2 in ordine. Ritorna un verdetto:
 * - DUPLICATE: almeno un segnale forte (1-4) — il candidato va collegato al lead
 *   esistente, mai creato ex-novo.
 * - POSSIBLE_DUPLICATE: solo segnale fuzzy (5) — segnalato all'owner, MAI merge
 *   automatico (§13.2 punto 5).
 * - NEW: nessun segnale.
 */
export function findDuplicates(
  candidate: DedupeCandidate,
  existing: readonly DedupeLeadRecord[],
  fuzzy: FuzzyThresholds = DEFAULT_FUZZY_THRESHOLDS,
): DedupeResult {
  const candidateDomain = normalizeDomain(candidate.websiteUrl);
  const candidatePhone = normalizePhone(candidate.phone);
  const candidateEmail = normalizeEmail(candidate.email);

  const signals: DedupeSignal[] = [];

  for (const lead of existing) {
    // 1. google_place_id
    if (candidate.googlePlaceId && lead.googlePlaceId === candidate.googlePlaceId) {
      signals.push({
        kind: 'GOOGLE_PLACE_ID',
        order: 1,
        matchedLeadId: lead.id,
        detail: `google_place_id "${candidate.googlePlaceId}" già presente`,
        strong: true,
      });
      continue; // match forte definitivo per questo lead
    }
    // 2. normalized_domain
    if (candidateDomain && lead.normalizedDomain === candidateDomain) {
      signals.push({
        kind: 'NORMALIZED_DOMAIN',
        order: 2,
        matchedLeadId: lead.id,
        detail: `dominio normalizzato "${candidateDomain}" condiviso`,
        strong: true,
      });
      continue;
    }
    // 3. normalized_phone
    if (candidatePhone && lead.normalizedPhone === candidatePhone) {
      signals.push({
        kind: 'NORMALIZED_PHONE',
        order: 3,
        matchedLeadId: lead.id,
        detail: `telefono normalizzato "${candidatePhone}" condiviso`,
        strong: true,
      });
      continue;
    }
    // 4. normalized_email
    if (candidateEmail && lead.normalizedEmail === candidateEmail) {
      signals.push({
        kind: 'NORMALIZED_EMAIL',
        order: 4,
        matchedLeadId: lead.id,
        detail: `email normalizzata "${candidateEmail}" condivisa`,
        strong: true,
      });
      continue;
    }
    // 5. fuzzy name + distanza geografica — SOLO segnale
    const similarity = nameSimilarity(candidate.name, lead.name);
    const distance = geoDistanceMeters(candidate, lead);
    if (similarity >= fuzzy.minNameSimilarity && distance !== null && distance <= fuzzy.maxDistanceMeters) {
      signals.push({
        kind: 'FUZZY_NAME_GEO',
        order: 5,
        matchedLeadId: lead.id,
        detail:
          `nome simile (${similarity.toFixed(2)}) a ${Math.round(distance)}m: ` +
          'segnale informativo, nessun merge automatico (§13.2)',
        strong: false,
      });
    }
  }

  signals.sort((a, b) => a.order - b.order);
  const strong = signals.find((s) => s.strong) ?? null;

  if (strong) {
    return { verdict: 'DUPLICATE', signals, strongMatchLeadId: strong.matchedLeadId };
  }
  if (signals.length > 0) {
    return { verdict: 'POSSIBLE_DUPLICATE', signals, strongMatchLeadId: null };
  }
  return { verdict: 'NEW', signals: [], strongMatchLeadId: null };
}
