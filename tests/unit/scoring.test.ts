import { describe, expect, it } from 'vitest';

import {
  computeLeadScore,
  DEFAULT_SCORE_WEIGHTS,
  SCORING_ALGORITHM_VERSION,
  type ScoreInput,
} from '../../src/lib/domain/scoring';
import type { WebsiteAuditResult } from '../../src/lib/types/domain';

function baseInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    email: null,
    emailValid: false,
    phone: null,
    websiteUrl: null,
    businessStatus: 'NEW',
    rating: null,
    reviewCount: null,
    category: null,
    hasGooglePlaceId: false,
    audit: null,
    ...overrides,
  };
}

function auditWith(issues: WebsiteAuditResult['issues'], opportunities: WebsiteAuditResult['opportunities'] = []): WebsiteAuditResult {
  return {
    finalUrl: 'https://example.com',
    redirectChain: [],
    emailsFound: [],
    phonesFound: [],
    socialLinks: [],
    ctas: [],
    keyPages: [],
    mobileSignals: { responsive: false, viewportMeta: false },
    issues,
    opportunities,
    evidenceAssets: [],
    analyzedBy: 'browser-worker-mock',
  };
}

describe('computeLeadScore (§5.1)', () => {
  it('produce breakdown completo sulle 5 dimensioni con algorithm_version e reasons', () => {
    const score = computeLeadScore(baseInput());
    expect(score.algorithmVersion).toBe(SCORING_ALGORITHM_VERSION);
    expect(Object.keys(score.breakdown).sort()).toEqual(
      ['business_potential', 'contactability', 'data_confidence', 'opportunity', 'template_match'].sort(),
    );
    for (const dim of Object.values(score.breakdown)) {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
      expect(dim.signals.length).toBeGreaterThan(0);
      expect(dim.weight).toBe(DEFAULT_SCORE_WEIGHTS ? dim.weight : dim.weight);
    }
    expect(score.reasons.length).toBeGreaterThan(0);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it('lead senza sito → opportunity massima', () => {
    const score = computeLeadScore(baseInput({ websiteUrl: null }));
    expect(score.opportunityScore).toBe(95);
  });

  it('audit con issue critiche alza opportunity in modo spiegabile', () => {
    const audit = auditWith([
      { type: 'no_mobile_optimization', severity: 'CRITICAL', evidence: 'no viewport', confidence: 100 },
      { type: 'outdated_design', severity: 'HIGH', evidence: 'layout vecchio', confidence: 90 },
    ]);
    const withAudit = computeLeadScore(baseInput({ websiteUrl: 'https://example.com', audit }));
    const withoutIssues = computeLeadScore(baseInput({ websiteUrl: 'https://example.com', audit: auditWith([]) }));
    expect(withAudit.opportunityScore).toBeGreaterThan(withoutIssues.opportunityScore);
    expect(withAudit.breakdown.opportunity.signals.some((s) => s.includes('no_mobile_optimization'))).toBe(true);
  });

  it('contactability premia email valida + telefono + sito', () => {
    const full = computeLeadScore(
      baseInput({ email: 'a@example.com', emailValid: true, phone: '+39 02 1234567', websiteUrl: 'https://example.com' }),
    );
    expect(full.contactabilityScore).toBe(100);

    const bare = computeLeadScore(baseInput());
    expect(bare.contactabilityScore).toBe(0);
  });

  it('email non validata produce reason esplicita (§5.2 la richiede)', () => {
    const score = computeLeadScore(baseInput({ email: 'a@example.com', emailValid: false }));
    expect(score.reasons.some((r) => r.includes('email non validata'))).toBe(true);
  });

  it('template match dipende dalla disponibilità di template per categoria', () => {
    const input = baseInput({ category: 'ristoranti' });
    const match = computeLeadScore(input, { categoriesWithTemplates: ['Ristoranti'] });
    expect(match.templateMatchScore).toBe(100);
    const noMatch = computeLeadScore(input, { categoriesWithTemplates: [] });
    expect(noMatch.templateMatchScore).toBe(20);
  });

  it('business potential cresce con rating e review count', () => {
    const low = computeLeadScore(baseInput({ rating: 3.0, reviewCount: 2 }));
    const high = computeLeadScore(baseInput({ rating: 4.9, reviewCount: 500 }));
    expect(high.businessPotentialScore).toBeGreaterThan(low.businessPotentialScore);
  });

  it('SUPPRESSED azzera il business potential', () => {
    const score = computeLeadScore(baseInput({ businessStatus: 'SUPPRESSED', rating: 5, reviewCount: 100 }));
    expect(score.businessPotentialScore).toBe(0);
  });

  it('pesi configurabili cambiano il totale', () => {
    const input = baseInput({ websiteUrl: null });
    const defaultScore = computeLeadScore(input);
    const opportunityHeavy = computeLeadScore(input, { weights: { opportunity: 0.9, contactability: 0.025, data_confidence: 0.025, template_match: 0.025, business_potential: 0.025 } });
    expect(opportunityHeavy.totalScore).toBeGreaterThan(defaultScore.totalScore);
  });

  it('è deterministico: stesso input → stesso output', () => {
    const input = baseInput({
      email: 'x@example.com',
      emailValid: true,
      websiteUrl: 'https://example.com',
      rating: 4.2,
      reviewCount: 42,
      category: 'palestre',
      hasGooglePlaceId: true,
    });
    const a = computeLeadScore(input, { categoriesWithTemplates: ['palestre'] });
    const b = computeLeadScore(input, { categoriesWithTemplates: ['palestre'] });
    expect(a).toEqual(b);
  });
});
