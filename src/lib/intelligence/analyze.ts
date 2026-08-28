import { createHash } from 'crypto';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { fetchHtmlSafe } from '@/lib/enrichment/email-from-website';
import { extractWebsiteSnapshot, snapshotCorpus, type WebsiteSnapshot } from './extract';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { estimateCostUsd } from '@/lib/ai/costs';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import { groundedWebsiteAnalysis } from '@/lib/ai/commercial/grounding';
import type { BusinessOpportunity, WebsiteAnalysis } from '@/lib/ai/commercial/schemas';
import { PROMPT_VERSIONS } from '@/lib/ai/commercial/schemas';
import { mockAnalyzeBusiness } from '@/lib/ai/commercial/mock-impl';

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export async function retrieveLeadWebsiteSnapshot(
  websiteUrl: string | null,
): Promise<WebsiteSnapshot> {
  if (!websiteUrl) {
    return extractWebsiteSnapshot('', null, 'no_website');
  }
  try {
    const html = await fetchHtmlSafe(websiteUrl);
    return extractWebsiteSnapshot(websiteUrl, html, html ? undefined : 'fetch_failed');
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'blocked';
    return extractWebsiteSnapshot(websiteUrl, null, reason);
  }
}

export async function analyzeLeadWebsite(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  leadId: string;
  env?: NodeJS.ProcessEnv;
  snapshot?: WebsiteSnapshot;
}): Promise<{ analysis: WebsiteAnalysis; snapshot: WebsiteSnapshot; opportunity: BusinessOpportunity }> {
  const env = args.env ?? process.env;
  const { data: lead, error } = await args.admin
    .from('leads')
    .select(
      'id, name, city, category, website_url, rating, review_count, discovery_score, email, business_status',
    )
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.leadId)
    .maybeSingle();
  if (error || !lead) throw new Error(error?.message ?? 'Lead non trovato');

  const snapshot = args.snapshot ?? await retrieveLeadWebsiteSnapshot(lead.website_url);
  const provider = getAICommercialProvider(env);
  const route = resolveModel('analyze_website', env);
  const persist = createSupabaseAiRunStore(args.admin);
  const started = Date.now();
  const result = await provider.analyzeWebsite(
    {
      snapshot,
      google: {
        name: lead.name,
        city: lead.city,
        category: lead.category,
        rating: lead.rating,
        reviewCount: lead.review_count,
      },
      screenshotAvailable: false,
    },
    { model: route.model },
  );
  const analysis = groundedWebsiteAnalysis(result.output, snapshotCorpus(snapshot));
  await persist({
    workspaceId: args.workspaceId,
    provider: env.AI_PROVIDER_MODE === 'openai' || env.AI_PROVIDER_MODE === 'live' ? 'openai' : 'mock',
    model: result.model,
    taskType: 'analyze_website',
    leadId: args.leadId,
    usage: result.usage,
    estimatedCostUsd: estimateCostUsd(result.usage, route.tier, env),
    latencyMs: Date.now() - started,
    status: 'ok',
    requestId: result.requestId,
    meta: { prompt_version: PROMPT_VERSIONS.websiteAnalysis },
  });

  const { data: contacted } = await args.admin
    .from('messages')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('lead_id', args.leadId)
    .eq('direction', 'OUTBOUND')
    .limit(1)
    .maybeSingle();

  const opportunity = mockAnalyzeBusiness({
    name: lead.name,
    city: lead.city,
    category: lead.category,
    rating: lead.rating,
    reviewCount: lead.review_count,
    websiteUrl: lead.website_url,
    discoveryScore: lead.discovery_score,
    alreadyContacted: Boolean(contacted?.id),
    email: lead.email,
    website: analysis,
  });

  await args.admin.from('website_analyses').insert({
    workspace_id: args.workspaceId,
    lead_id: args.leadId,
    website_url: lead.website_url,
    retrieved_text_hash: hashText(snapshot.textExcerpt || snapshot.url),
    opportunity_score: analysis.opportunityScore,
    confidence: analysis.confidence,
    visual_quality: analysis.visualQuality,
    mobile_clarity: analysis.mobileClarity,
    cta_clarity: analysis.ctaClarity,
    booking_clarity: analysis.bookingClarity,
    trust_presentation: analysis.trustPresentation,
    strengths: analysis.strengths as unknown as Json,
    issues: analysis.issues as unknown as Json,
    evidence: analysis.evidence as unknown as Json,
    recommended_offer: analysis.recommendedOffer,
    recommended_approach: analysis.recommendedApproach,
    human_review_required: analysis.humanReviewRequired,
    analysis: {
      website: analysis,
      opportunity,
      snapshot: {
        retrieved: snapshot.retrieved,
        title: snapshot.title,
        ctas: snapshot.ctas,
        bookingSignals: snapshot.bookingSignals,
        bookingUrl: snapshot.bookingUrl,
        blockedReason: snapshot.blockedReason,
      },
    } as unknown as Json,
    provider: result.model,
    model: result.model,
    prompt_version: PROMPT_VERSIONS.websiteAnalysis,
    schema_version: PROMPT_VERSIONS.websiteAnalysis,
  });

  return { analysis, snapshot, opportunity };
}
