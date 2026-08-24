import type { SupabaseClient } from '@supabase/supabase-js';
import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import type { LeadRow } from '@/lib/types/database';

function estimatedPlaceDetailsCostUsd(env: NodeJS.ProcessEnv): number {
  const raw = env.GOOGLE_PLACE_DETAILS_COST_USD;
  if (!raw) return 0.017;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0.017;
}

/** Place Details solo se mancano dati necessari alla preparazione commerciale. */
export function needsGooglePlaceDetails(lead: LeadRow): boolean {
  return !lead.phone || !lead.website_url;
}

export async function enrichLeadFromGoogleIfNeeded(
  admin: SupabaseClient,
  workspaceId: string,
  leadId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ skipped: boolean; reason?: string; lead?: LeadRow }> {
  const { data: lead, error } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .single();

  if (error || !lead) throw new Error(`Google enrich: lead non trovato — ${error?.message ?? ''}`);
  const row = lead as LeadRow;
  if (!row.google_place_id) return { skipped: true, reason: 'NO_PLACE_ID', lead: row };
  if (!needsGooglePlaceDetails(row)) {
    return { skipped: true, reason: 'ALREADY_SUFFICIENT', lead: row };
  }

  const enriched = await enrichLeadFromGoogle(admin, workspaceId, leadId, env);
  return { skipped: false, lead: enriched };
}

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
    estimated_cost_usd: estimatedPlaceDetailsCostUsd(env),
    meta: {
      placeId: row.google_place_id,
      costSource: env.GOOGLE_PLACE_DETAILS_COST_USD ? 'env' : 'estimated_default',
    },
  });

  return updated as LeadRow;
}
