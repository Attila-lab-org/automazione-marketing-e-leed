/**
 * Score Engine deterministico — MASTER_SPEC §5.1.
 *
 * - Input: dati lead + (opzionale) website audit normalizzato §14.1.
 * - Output: breakdown sulle 5 dimensioni §5.1, score totale pesato, confidence,
 *   motivazioni sintetiche, algorithm_version costante.
 * - Spiegabile: nessun punteggio senza segnali/evidenze. Niente AI opaca.
 * - Il Policy Engine (domain/policy.ts) decide sulle azioni; lo Score Engine
 *   si limita a produrre evidenze numeriche (§5.2).
 */

import type {
  AuditIssue,
  BusinessStatus,
  IssueSeverity,
  LeadScore,
  ScoreBreakdown,
  ScoreDimension,
  WebsiteAuditResult,
} from '../types/domain';

/** Versione corrente dell'algoritmo: bump obbligatorio a ogni modifica delle regole. */
export const SCORING_ALGORITHM_VERSION = 'scoring-v1.0';

/** Pesi default delle 5 dimensioni §5.1 (somma = 1). Configurabili. */
export const DEFAULT_SCORE_WEIGHTS: Record<ScoreDimension, number> = {
  opportunity: 0.3,
  contactability: 0.2,
  data_confidence: 0.2,
  template_match: 0.1,
  business_potential: 0.2,
};

export interface ScoringWeights {
  weights?: Partial<Record<ScoreDimension, number>>;
  /** Categorie per cui esiste almeno un template disponibile (template match §5.1). */
  categoriesWithTemplates?: readonly string[];
}

/** Input dello Score Engine: dati lead + audit opzionale. */
export interface ScoreInput {
  email: string | null;
  emailValid: boolean;
  phone: string | null;
  websiteUrl: string | null;
  businessStatus: BusinessStatus;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  hasGooglePlaceId: boolean;
  audit: WebsiteAuditResult | null;
}

// ---------------------------------------------------------------------------
// Helpers deterministici
// ---------------------------------------------------------------------------

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const SEVERITY_PENALTY: Record<IssueSeverity, number> = {
  LOW: 5,
  MEDIUM: 12,
  HIGH: 22,
  CRITICAL: 35,
};

function issuePenalty(issue: AuditIssue): number {
  const base = SEVERITY_PENALTY[issue.severity];
  // La confidence dell'evidenza modula il peso del problema (0.5–1.0).
  const confidenceFactor = 0.5 + 0.5 * (Math.min(100, Math.max(0, issue.confidence)) / 100);
  return base * confidenceFactor;
}

// ---------------------------------------------------------------------------
// Dimensioni §5.1
// ---------------------------------------------------------------------------

function scoreOpportunity(input: ScoreInput): { score: number; signals: string[] } {
  const signals: string[] = [];

  // Nessun sito = massima opportunità di intervento.
  if (!input.websiteUrl) {
    signals.push('no_website: il lead non ha un sito pubblico');
    return { score: 95, signals };
  }

  if (!input.audit) {
    signals.push('audit_pending: sito presente ma non ancora analizzato');
    return { score: 50, signals };
  }

  let penalty = 0;
  for (const issue of input.audit.issues) {
    const p = issuePenalty(issue);
    penalty += p;
    signals.push(
      `issue:${issue.type} (${issue.severity.toLowerCase()}, confidence ${issue.confidence}) -${Math.round(p)}`,
    );
  }

  // Le opportunità esplicite rilevate dall'audit alzano il potenziale.
  let bonus = 0;
  for (const opp of input.audit.opportunities) {
    const b = 8 * (0.5 + 0.5 * (Math.min(100, Math.max(0, opp.confidence)) / 100));
    bonus += b;
    signals.push(`opportunity:${opp.type} +${Math.round(b)}`);
  }

  const score = clampScore(40 + penalty + bonus);
  if (input.audit.issues.length === 0 && input.audit.opportunities.length === 0) {
    signals.push('clean_audit: nessun problema/opportunità rilevato');
  }
  return { score, signals };
}

function scoreContactability(input: ScoreInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (input.emailValid && input.email) {
    score += 60;
    signals.push('valid_email: email presente e valida');
  } else if (input.email) {
    score += 25;
    signals.push('unverified_email: email presente ma non validata');
  } else {
    signals.push('no_email: nessuna email disponibile');
  }

  if (input.phone) {
    score += 25;
    signals.push('phone_available: telefono presente');
  } else {
    signals.push('no_phone: telefono assente');
  }

  if (input.websiteUrl) {
    score += 15;
    signals.push('website_present: sito pubblico presente');
  } else {
    signals.push('no_website: nessun sito');
  }

  return { score: clampScore(score), signals };
}

const COMPLETE_BUSINESS_STATUSES: readonly BusinessStatus[] = [
  'QUALIFIED',
  'CAMPAIGN_READY',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'WON',
];

function scoreDataConfidence(input: ScoreInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (input.hasGooglePlaceId) {
    score += 25;
    signals.push('google_place_id: identificatore forte presente (§13.1)');
  }
  if (input.category) {
    score += 15;
    signals.push('category_known: categoria assegnata');
  }
  if (input.email) {
    score += 15;
    signals.push('email_on_record');
  }
  if (input.phone) {
    score += 15;
    signals.push('phone_on_record');
  }
  if (input.websiteUrl) {
    score += 10;
    signals.push('website_on_record');
  }
  if (input.rating !== null && input.reviewCount !== null && input.reviewCount > 0) {
    score += 10;
    signals.push('rating_data: rating e recensioni presenti');
  }
  if (COMPLETE_BUSINESS_STATUSES.includes(input.businessStatus)) {
    score += 10;
    signals.push(`business_status:${input.businessStatus} (lead lavorato)`);
  }

  if (score === 0) {
    signals.push('empty_record: nessun dato disponibile');
  }
  return { score: clampScore(score), signals };
}

function scoreTemplateMatch(
  input: ScoreInput,
  categoriesWithTemplates: readonly string[],
): { score: number; signals: string[] } {
  const signals: string[] = [];

  if (!input.category) {
    signals.push('no_category: impossibile valutare il match con i template');
    return { score: 0, signals };
  }
  const normalized = input.category.trim().toLowerCase();
  if (categoriesWithTemplates.map((c) => c.trim().toLowerCase()).includes(normalized)) {
    signals.push(`template_available: template disponibile per categoria "${input.category}"`);
    return { score: 100, signals };
  }
  signals.push(`no_template: nessun template per categoria "${input.category}"`);
  return { score: 20, signals };
}

function scoreBusinessPotential(input: ScoreInput): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (input.rating !== null) {
    // rating 0-5 → 0-50 punti
    const ratingPoints = (Math.max(0, Math.min(5, input.rating)) / 5) * 50;
    score += ratingPoints;
    signals.push(`rating:${input.rating.toFixed(1)}/5 → +${Math.round(ratingPoints)}`);
  } else {
    signals.push('no_rating');
  }

  const reviews = input.reviewCount ?? 0;
  if (reviews > 0) {
    // scala logaritmica: 1 review ≈ 10, 10 ≈ 24, 100 ≈ 38, 1000+ ≈ 50
    const reviewPoints = Math.min(50, 12 * Math.log10(reviews + 1));
    score += reviewPoints;
    signals.push(`review_count:${reviews} → +${Math.round(reviewPoints)}`);
  } else {
    signals.push('no_reviews');
  }

  if (input.businessStatus === 'NEW') {
    signals.push('status:new — potenziale non ancora validato');
  } else if (input.businessStatus === 'SUPPRESSED' || input.businessStatus === 'LOST') {
    score = 0;
    signals.push(`status:${input.businessStatus} — potenziale azzerato`);
  }

  return { score: clampScore(score), signals };
}

// ---------------------------------------------------------------------------
// Engine principale
// ---------------------------------------------------------------------------

/**
 * Calcola lo score composito §5.1. Deterministico: stesso input → stesso output.
 */
export function computeLeadScore(input: ScoreInput, options: ScoringWeights = {}): LeadScore {
  const weights: Record<ScoreDimension, number> = {
    ...DEFAULT_SCORE_WEIGHTS,
    ...options.weights,
  };
  const categoriesWithTemplates = options.categoriesWithTemplates ?? [];

  const opportunity = scoreOpportunity(input);
  const contactability = scoreContactability(input);
  const dataConfidence = scoreDataConfidence(input);
  const templateMatch = scoreTemplateMatch(input, categoriesWithTemplates);
  const businessPotential = scoreBusinessPotential(input);

  const breakdown: ScoreBreakdown = {
    opportunity: { score: opportunity.score, weight: weights.opportunity, signals: opportunity.signals },
    contactability: { score: contactability.score, weight: weights.contactability, signals: contactability.signals },
    data_confidence: { score: dataConfidence.score, weight: weights.data_confidence, signals: dataConfidence.signals },
    template_match: { score: templateMatch.score, weight: weights.template_match, signals: templateMatch.signals },
    business_potential: { score: businessPotential.score, weight: weights.business_potential, signals: businessPotential.signals },
  };

  const totalWeight =
    weights.opportunity +
    weights.contactability +
    weights.data_confidence +
    weights.template_match +
    weights.business_potential;

  const totalScore =
    totalWeight > 0
      ? clampScore(
          (opportunity.score * weights.opportunity +
            contactability.score * weights.contactability +
            dataConfidence.score * weights.data_confidence +
            templateMatch.score * weights.template_match +
            businessPotential.score * weights.business_potential) /
            totalWeight,
        )
      : 0;

  // Confidence complessiva: quanto i dati disponibili supportano la valutazione.
  let confidence = dataConfidence.score * 0.5;
  if (input.audit) confidence += 25;
  if (input.websiteUrl) confidence += 10;
  if (input.rating !== null && (input.reviewCount ?? 0) > 0) confidence += 15;
  confidence = clampScore(confidence);

  const reasons: string[] = [];
  reasons.push(
    `total=${totalScore} (opportunity ${opportunity.score}, contactability ${contactability.score}, ` +
      `data_confidence ${dataConfidence.score}, template_match ${templateMatch.score}, ` +
      `business_potential ${businessPotential.score})`,
  );
  if (opportunity.score >= 85) reasons.push('opportunity alta: ampio margine di miglioramento rilevato');
  if (contactability.score >= 80) reasons.push('contattabilità forte: email valida e canali multipli');
  if (!input.emailValid) reasons.push('email non validata: l\'auto-send §5.2 non può essere autorizzato');
  if (!input.audit && input.websiteUrl) reasons.push('audit sito mancante: opportunity stimata, confidence ridotta');

  return {
    algorithmVersion: SCORING_ALGORITHM_VERSION,
    opportunityScore: opportunity.score,
    contactabilityScore: contactability.score,
    dataConfidenceScore: dataConfidence.score,
    templateMatchScore: templateMatch.score,
    businessPotentialScore: businessPotential.score,
    totalScore,
    confidence,
    breakdown,
    reasons,
  };
}
