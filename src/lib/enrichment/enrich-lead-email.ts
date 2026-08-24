import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultEmailEnrichmentProvider,
  type EmailEnrichmentProvider,
  type EmailEnrichmentResult,
} from './email-from-website';

export async function enrichLeadEmail(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
  provider: EmailEnrichmentProvider = defaultEmailEnrichmentProvider,
): Promise<EmailEnrichmentResult & { status: string }> {
  const { data: lead, error } = await admin
    .from('leads')
    .select('id, email, website_url, normalized_email')
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .single();

  if (error || !lead) throw new Error(`Email enrich: lead non trovato — ${error?.message ?? ''}`);
  if (lead.email) {
    return {
      email: lead.email,
      sourceUrl: null,
      sourceType: null,
      sameDomain: false,
      status: 'ALREADY_PRESENT',
      candidates: [lead.email],
      candidateEvidence: [
        {
          email: lead.email,
          sourceUrl: null,
          sourceType: null,
          sameDomain: false,
          confidence: 1,
        },
      ],
      confidence: 1,
    };
  }

  const website = lead.website_url?.trim();
  if (!website) {
    return {
      email: null,
      sourceUrl: null,
      sourceType: null,
      sameDomain: false,
      status: 'NO_WEBSITE',
      candidates: [],
      candidateEvidence: [],
      confidence: 0,
    };
  }

  const result = await provider.enrichFromWebsite(website);

  if (result.email) {
    await admin.from('lead_contacts').insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      type: 'EMAIL',
      value: result.email,
      normalized_value: result.email,
      label: result.sourceType ?? 'website_enrichment',
      is_primary: true,
      source: 'WEBSITE_SCRAPE',
    });

    await admin
      .from('leads')
      .update({
        email: result.email,
        normalized_email: result.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    await admin.from('cost_events').insert({
      workspace_id: workspaceId,
      provider: 'email_enrichment',
      operation: 'website_scrape.email',
      entity_type: 'lead',
      entity_id: leadId,
      lead_id: leadId,
      quantity: 1,
      estimated_cost_usd: 0,
      meta: {
        sourceUrl: result.sourceUrl,
        sourceType: result.sourceType,
        sameDomain: result.sameDomain,
        confidence: result.confidence,
        candidates: result.candidates,
        candidateEvidence: result.candidateEvidence,
      },
    });
  }

  return { ...result, status: result.status === 'FOUND' ? 'FOUND' : result.status };
}
