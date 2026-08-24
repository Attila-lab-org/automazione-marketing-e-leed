/**
 * Discovery Qualification Engine V1 — Phase B.
 *
 * Usa SOLO dati economici già disponibili dalla discovery Google Places.
 * Deterministico, configurabile, auditabile. Nessuna AI / browser / email.
 *
 * NON è lo score finale opportunity (§5.1 + audit): quello arriverà dopo
 * Browser Worker. Qui: Discovery Score + Confidence + Qualification Status.
 */

export const DISCOVERY_QUALIFICATION_VERSION = 'discovery-qual-v1.0';

export const OFFER_WEBSITE_UPGRADE = 'website_upgrade';

export const QUALIFICATION_STATUSES = [
  'NEW',
  'PREQUALIFIED',
  'NEEDS_ANALYSIS',
  'LOW_PRIORITY',
  'REJECTED',
] as const;

export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

/** Attractiveness commerciale per verticale — facilmente modificabile. */
export type VerticalTier = 'high' | 'medium_high' | 'neutral' | 'low';

export interface VerticalConfig {
  tier: VerticalTier;
  /** Punti Discovery Score per il tier (0–100 scala relativa). */
  points: number;
  label: string;
  match: readonly string[];
}

/**
 * Config verticale V1. Ordine: primo match vince.
 * Non hardcodare ristoranti come unico caso: pattern generici.
 */
export const DEFAULT_VERTICAL_CONFIG: readonly VerticalConfig[] = [
  {
    tier: 'high',
    points: 25,
    label: 'Verticale food/ristorazione ad alto valore',
    match: [
      'restaurant',
      'italian_restaurant',
      'food',
      'meal_takeaway',
      'meal_delivery',
      'cafe',
      'bakery',
      'bar',
      'ristoranti',
      'ristorante',
    ],
  },
  {
    tier: 'high',
    points: 25,
    label: 'Verticale dentale ad alto valore',
    match: ['dentist', 'dental_clinic', 'dentisti', 'dentista'],
  },
  {
    tier: 'high',
    points: 25,
    label: 'Verticale beauty/spa ad alto valore',
    match: [
      'beauty_salon',
      'hair_care',
      'spa',
      'nail_salon',
      'beauty',
      'parrucchieri',
      'parrucchiere',
    ],
  },
  {
    tier: 'high',
    points: 25,
    label: 'Verticale hospitality ad alto valore',
    match: ['hotel', 'lodging', 'guest_house', 'bed_and_breakfast', 'resort'],
  },
  {
    tier: 'medium_high',
    points: 18,
    label: 'Verticale fitness medio-alto',
    match: ['gym', 'fitness_center', 'sports_club', 'palestre', 'palestra'],
  },
  {
    tier: 'neutral',
    points: 10,
    label: 'Business locale generico',
    match: ['establishment', 'point_of_interest', 'store', 'local_business'],
  },
];

export interface QualificationThresholds {
  prequalifiedMin: number;
  needsAnalysisMin: number;
}

/** Default soglie Phase B. */
export const DEFAULT_QUALIFICATION_THRESHOLDS: QualificationThresholds = {
  prequalifiedMin: 70,
  needsAnalysisMin: 50,
};

export interface DiscoveryQualificationInput {
  googlePlaceId: string | null;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  /** null = assente (opportunità digitale); string = presente. */
  websiteUrl: string | null;
  /** Business status Google Places se noto (es. OPERATIONAL, CLOSED_PERMANENTLY). */
  googleBusinessStatus?: string | null;
}

export interface QualificationReason {
  code: string;
  label: string;
  /** Impatto sul Discovery Score (può essere 0 se riguarda solo confidence). */
  scoreDelta: number;
  /** Impatto sulla Confidence. */
  confidenceDelta: number;
}

export interface DiscoveryQualificationResult {
  algorithmVersion: string;
  discoveryScore: number;
  confidence: number;
  status: QualificationStatus;
  offerCandidate: string | null;
  reasons: QualificationReason[];
  /** Motivazioni leggibili per UI. */
  reasonLabels: string[];
}

export interface QualifyOptions {
  verticals?: readonly VerticalConfig[];
  thresholds?: QualificationThresholds;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function resolveVertical(
  category: string | null,
  verticals: readonly VerticalConfig[] = DEFAULT_VERTICAL_CONFIG,
): VerticalConfig {
  const raw = category?.trim() ?? '';
  if (!raw) {
    return {
      tier: 'neutral',
      points: 10,
      label: 'Categoria assente — peso neutro',
      match: [],
    };
  }
  const tokens = raw
    .split(/[|,/]/)
    .map(normalizeToken)
    .filter(Boolean);
  tokens.push(normalizeToken(raw));

  for (const cfg of verticals) {
    for (const token of tokens) {
      if (cfg.match.some((m) => token === m || token.includes(m) || m.includes(token))) {
        return cfg;
      }
    }
  }
  return {
    tier: 'neutral',
    points: 10,
    label: 'Business locale generico',
    match: [],
  };
}

function reviewPoints(reviewCount: number | null): { points: number; label: string } {
  const n = reviewCount ?? 0;
  if (n >= 300) return { points: 20, label: `${n} recensioni Google (volume molto alto)` };
  if (n >= 100) return { points: 15, label: `${n} recensioni Google (volume alto)` };
  if (n >= 50) return { points: 10, label: `${n} recensioni Google` };
  if (n >= 20) return { points: 5, label: `${n} recensioni Google` };
  if (n > 0) return { points: 0, label: `${n} recensioni Google (volume basso)` };
  return { points: 0, label: 'Nessuna recensione disponibile' };
}

/**
 * Calcola Discovery Score + Confidence + Status.
 * Stesso input → stesso output (deterministico).
 */
export function qualifyFromDiscovery(
  input: DiscoveryQualificationInput,
  options: QualifyOptions = {},
): DiscoveryQualificationResult {
  const verticals = options.verticals ?? DEFAULT_VERTICAL_CONFIG;
  const thresholds = { ...DEFAULT_QUALIFICATION_THRESHOLDS, ...options.thresholds };
  const reasons: QualificationReason[] = [];

  // --- REJECT hard conditions ---
  if (!input.googlePlaceId || !input.googlePlaceId.trim()) {
    reasons.push({
      code: 'missing_place_id',
      label: 'Place ID assente — lead non qualificabile',
      scoreDelta: 0,
      confidenceDelta: 0,
    });
    return {
      algorithmVersion: DISCOVERY_QUALIFICATION_VERSION,
      discoveryScore: 0,
      confidence: 0,
      status: 'REJECTED',
      offerCandidate: null,
      reasons,
      reasonLabels: reasons.map((r) => r.label),
    };
  }

  const closed =
    input.googleBusinessStatus === 'CLOSED_PERMANENTLY' ||
    input.googleBusinessStatus === 'CLOSED_TEMPORARILY';
  if (closed) {
    reasons.push({
      code: 'business_closed',
      label: `Attività non operativa (${input.googleBusinessStatus})`,
      scoreDelta: 0,
      confidenceDelta: 20,
    });
    return {
      algorithmVersion: DISCOVERY_QUALIFICATION_VERSION,
      discoveryScore: 0,
      confidence: 40,
      status: 'REJECTED',
      offerCandidate: null,
      reasons,
      reasonLabels: reasons.map((r) => r.label),
    };
  }

  let score = 0;
  let confidence = 0;

  // Place ID presente (requisito già passato)
  reasons.push({
    code: 'place_id',
    label: 'Place ID Google valido',
    scoreDelta: 0,
    confidenceDelta: 25,
  });
  confidence += 25;

  // Commercial activity / credibility
  const operational =
    !input.googleBusinessStatus || input.googleBusinessStatus === 'OPERATIONAL';
  if (operational && input.name.trim()) {
    score += 10;
    reasons.push({
      code: 'operational',
      label: 'Business operativo / dati anagrafici coerenti',
      scoreDelta: 10,
      confidenceDelta: 0,
    });
  }

  if (input.rating !== null && Number.isFinite(input.rating)) {
    score += 5;
    reasons.push({
      code: 'rating_present',
      label: `Rating ${input.rating.toFixed(1)}/5`,
      scoreDelta: 5,
      confidenceDelta: 15,
    });
    confidence += 15;
  }

  const reviews = reviewPoints(input.reviewCount);
  if (reviews.points > 0 || (input.reviewCount ?? 0) > 0) {
    score += reviews.points;
    reasons.push({
      code: 'review_volume',
      label: reviews.label,
      scoreDelta: reviews.points,
      confidenceDelta: (input.reviewCount ?? 0) > 0 ? 15 : 0,
    });
    if ((input.reviewCount ?? 0) > 0) confidence += 15;
  } else {
    reasons.push({
      code: 'no_reviews',
      label: reviews.label,
      scoreDelta: 0,
      confidenceDelta: 0,
    });
  }

  // Digital opportunity
  if (!input.websiteUrl) {
    score += 30;
    reasons.push({
      code: 'no_website',
      label: 'Sito non rilevato — alta opportunità website upgrade',
      scoreDelta: 30,
      confidenceDelta: 15,
    });
    confidence += 15; // assenza accertata
  } else {
    reasons.push({
      code: 'website_present',
      label: 'Sito presente — pronto per preparazione commerciale',
      scoreDelta: 0,
      confidenceDelta: 15,
    });
    confidence += 15;
  }

  // Vertical attractiveness
  const vertical = resolveVertical(input.category, verticals);
  score += vertical.points;
  reasons.push({
    code: 'vertical',
    label: vertical.label,
    scoreDelta: vertical.points,
    confidenceDelta: input.category ? 15 : 0,
  });
  if (input.category) confidence += 15;

  // Geo quality
  const hasGeo =
    (typeof input.lat === 'number' && typeof input.lng === 'number') ||
    Boolean(input.city?.trim()) ||
    Boolean(input.address?.trim());
  if (hasGeo) {
    score += 5;
    reasons.push({
      code: 'geo_ok',
      label: 'Dati geografici validi',
      scoreDelta: 5,
      confidenceDelta: 15,
    });
    confidence += 15;
  } else {
    reasons.push({
      code: 'geo_weak',
      label: 'Dati geografici incompleti — confidence ridotta',
      scoreDelta: 0,
      confidenceDelta: 0,
    });
  }

  const discoveryScore = clamp(score);
  const conf = clamp(confidence);

  let status: QualificationStatus;
  if (discoveryScore >= thresholds.prequalifiedMin) {
    status = 'PREQUALIFIED';
  } else if (discoveryScore >= thresholds.needsAnalysisMin) {
    status = 'NEEDS_ANALYSIS';
  } else {
    status = 'LOW_PRIORITY';
  }

  // Offerta V1: website upgrade per lead non rejected (già esclusi sopra)
  const offerCandidate = OFFER_WEBSITE_UPGRADE;

  if (offerCandidate) {
    reasons.push({
      code: 'offer_candidate',
      label: `Offerta candidata: ${offerCandidate}`,
      scoreDelta: 0,
      confidenceDelta: 0,
    });
  }

  reasons.push({
    code: 'status_decision',
    label: `Stato ${status} (score ${discoveryScore}, soglie ${thresholds.prequalifiedMin}/${thresholds.needsAnalysisMin})`,
    scoreDelta: 0,
    confidenceDelta: 0,
  });

  return {
    algorithmVersion: DISCOVERY_QUALIFICATION_VERSION,
    discoveryScore,
    confidence: conf,
    status,
    offerCandidate,
    reasons,
    reasonLabels: reasons
      .filter((r) => r.code !== 'status_decision' && r.code !== 'offer_candidate')
      .map((r) => r.label),
  };
}

/** Applica il risultato ai campi lead (snake_case DB). */
export function qualificationToLeadPatch(result: DiscoveryQualificationResult) {
  return {
    discovery_score: result.discoveryScore,
    discovery_confidence: result.confidence,
    qualification_status: result.status,
    offer_candidate: result.offerCandidate,
    qualification_reasons: result.reasons as unknown as import('@/lib/types/database').Json,
    qualification_algorithm_version: result.algorithmVersion,
    qualified_at: new Date().toISOString(),
    current_score: result.discoveryScore,
    current_confidence: result.confidence,
  };
}
