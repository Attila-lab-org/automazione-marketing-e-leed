/**
 * Bulk discovery qualification + cost event recording.
 * Nessuna chiamata Google/Resend/AI/Browser: solo CPU + update DB batch.
 */

import {
  qualifyFromDiscovery,
  qualificationToLeadPatch,
  type DiscoveryQualificationInput,
} from '@/lib/domain/discovery-qualification';
import type { CostEventInsert, LeadRow } from '@/lib/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export function leadRowToQualificationInput(lead: LeadRow): DiscoveryQualificationInput {
  return {
    googlePlaceId: lead.google_place_id,
    name: lead.name,
    category: lead.category,
    address: lead.address,
    city: lead.city,
    region: lead.region,
    lat: lead.lat,
    lng: lead.lng,
    rating: lead.rating,
    reviewCount: lead.review_count,
    websiteUrl: lead.website_url,
    googleBusinessStatus: null,
  };
}

/**
 * Qualifica in memoria e applica update in batch (chunk).
 * Idempotente: ricalcola sempre dagli stessi campi discovery.
 */
export async function qualifyLeadsBulk(
  admin: SupabaseClient,
  leads: LeadRow[],
): Promise<{ qualified: number; leads: LeadRow[] }> {
  if (leads.length === 0) return { qualified: 0, leads: [] };

  const patched: LeadRow[] = [];
  for (const lead of leads) {
    const result = qualifyFromDiscovery(leadRowToQualificationInput(lead));
    const patch = qualificationToLeadPatch(result);
    patched.push({ ...lead, ...patch } as unknown as LeadRow);
  }

  // Update per-lead (payload diversi). Chunk per evitare payload enormi.
  const CHUNK = 40;
  for (let i = 0; i < patched.length; i += CHUNK) {
    const slice = patched.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (lead) => {
        const { error } = await admin
          .from('leads')
          .update({
            discovery_score: lead.discovery_score,
            discovery_confidence: lead.discovery_confidence,
            qualification_status: lead.qualification_status,
            offer_candidate: lead.offer_candidate,
            qualification_reasons: lead.qualification_reasons,
            qualification_algorithm_version: lead.qualification_algorithm_version,
            qualified_at: lead.qualified_at,
            current_score: lead.current_score,
            current_confidence: lead.current_confidence,
          })
          .eq('id', lead.id);
        if (error) {
          throw new Error(`Qualification update fallito (${lead.id}): ${error.message}`);
        }
      }),
    );
  }

  return { qualified: patched.length, leads: patched };
}

/** Stima costo Text Search New (placeholder configurabile; non billing reale). */
export const ESTIMATED_COST_USD = {
  'google_places.discovery_per_result': 0.032,
  'discovery.qualification_per_lead': 0,
} as const;

export async function recordCostEvent(
  admin: SupabaseClient,
  event: CostEventInsert,
): Promise<void> {
  const { error } = await admin.from('cost_events').insert(event);
  if (error) {
    console.error('cost_events insert failed:', error.message);
  }
}
