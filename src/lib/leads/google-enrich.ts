import type { SupabaseClient } from '@supabase/supabase-js';
import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import type { LeadRow } from '@/lib/types/database';

export async function enrichLeadFromGoogle(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LeadRow> {
  const { data: lead, error } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .single();

  if (error || !lead) throw new Error(`Google enrich: lead non trovato — ${error?.message ?? ''}`);
  const row = lead as LeadRow;
  if (!row.google_place_id) return row;

  const provider = getGooglePlacesProvider(env);
  const enrichment = await provider.enrich(row.google_place_id);

  const patch = {
    website_url: enrichment.websiteUrl ?? row.website_url,
    phone: enrichment.phone ?? row.phone,
    rating: enrichment.rating ?? row.rating,
    review_count: enrichment.reviewCount ?? row.review_count,
    google_last_enriched_at: enrichment.enrichedAt,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updError } = await admin
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .single();

  if (updError || !updated) {
    throw new Error(`Google enrich: update fallito — ${updError?.message ?? ''}`);
  }

  await admin.from('cost_events').insert({
    workspace_id: workspaceId,
    provider: 'google_places',
    operation: 'place_details.enrich',
    entity_type: 'lead',
    entity_id: leadId,
    lead_id: leadId,
    quantity: 1,
    estimated_cost_usd: 0.017,
    meta: { placeId: row.google_place_id },
  });

  return updated as LeadRow;
}
