/**
 * Discovery Google Places → dedupe google_place_id → persistenza Supabase.
 * Slice 1: nessuna email, nessuno scoring, nessun outreach.
 */

import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import type { DiscoveredPlace, DiscoveryQuery } from '@/lib/providers/google-places/types';
import { createAdminSupabaseClient } from '@/lib/supabase/client';
import type { LeadRow } from '@/lib/types/database';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { discoveredPlaceToLeadInsert } from './normalize';

export const DISCOVERY_MAX_RESULTS = 5;

export type DiscoveryInput = {
  category: string;
  location: string;
  maxResults?: number;
};

export type DiscoveryResult = {
  found: number;
  created: number;
  duplicates: number;
  leads: LeadRow[];
  query: DiscoveryQuery;
};

export function validateDiscoveryInput(raw: unknown): DiscoveryInput {
  if (!raw || typeof raw !== 'object') {
    throw new DiscoveryValidationError('Body JSON non valido');
  }
  const body = raw as Record<string, unknown>;
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const maxRaw = body.maxResults;

  if (!category || category.length < 2 || category.length > 120) {
    throw new DiscoveryValidationError('Categoria/query obbligatoria (2–120 caratteri)');
  }
  if (!location || location.length < 2 || location.length > 120) {
    throw new DiscoveryValidationError('Località obbligatoria (2–120 caratteri)');
  }
  if (/[\x00-\x1f]/.test(category) || /[\x00-\x1f]/.test(location)) {
    throw new DiscoveryValidationError('Input contiene caratteri non validi');
  }

  let maxResults = DISCOVERY_MAX_RESULTS;
  if (maxRaw !== undefined && maxRaw !== null) {
    const n = typeof maxRaw === 'number' ? maxRaw : Number(maxRaw);
    if (!Number.isFinite(n) || n < 1 || n > DISCOVERY_MAX_RESULTS) {
      throw new DiscoveryValidationError(
        `maxResults deve essere un intero tra 1 e ${DISCOVERY_MAX_RESULTS}`,
      );
    }
    maxResults = Math.floor(n);
  }

  return { category, location, maxResults };
}

export class DiscoveryValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryValidationError';
  }
}

export async function runLeadDiscovery(
  input: DiscoveryInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DiscoveryResult> {
  const query: DiscoveryQuery = {
    category: input.category,
    location: input.location,
    maxResults: input.maxResults ?? DISCOVERY_MAX_RESULTS,
  };

  const admin = createAdminSupabaseClient(env);
  const workspace = await ensureDefaultWorkspace(admin);
  const provider = getGooglePlacesProvider(env);
  const places = await provider.searchMinimal(query);

  if (places.length === 0) {
    return { found: 0, created: 0, duplicates: 0, leads: [], query };
  }

  const placeIds = places.map((p) => p.googlePlaceId);
  const { data: existingRows, error: existingError } = await admin
    .from('leads')
    .select('id, google_place_id')
    .eq('workspace_id', workspace.id)
    .in('google_place_id', placeIds);

  if (existingError) {
    throw new Error(`Discovery: lettura lead esistenti fallita — ${existingError.message}`);
  }

  const existingByPlaceId = new Map<string, string>();
  for (const row of existingRows ?? []) {
    if (row.google_place_id) existingByPlaceId.set(row.google_place_id, row.id);
  }

  const toCreate: DiscoveredPlace[] = [];
  const duplicateIds: string[] = [];
  for (const place of places) {
    const existingId = existingByPlaceId.get(place.googlePlaceId);
    if (existingId) {
      duplicateIds.push(existingId);
    } else {
      toCreate.push(place);
    }
  }

  const createdLeads: LeadRow[] = [];
  for (const place of toCreate) {
    const insert = discoveredPlaceToLeadInsert(place, workspace.id);
    const { data: lead, error: insertError } = await admin
      .from('leads')
      .insert(insert)
      .select('*')
      .single();

    if (insertError) {
      // Unique index race: tratta come duplicato.
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('leads')
          .select('id')
          .eq('workspace_id', workspace.id)
          .eq('google_place_id', place.googlePlaceId)
          .maybeSingle();
        if (raced?.id) duplicateIds.push(raced.id);
        continue;
      }
      throw new Error(`Discovery: insert lead fallito — ${insertError.message}`);
    }

    createdLeads.push(lead as LeadRow);

    const { error: sourceError } = await admin.from('lead_sources').insert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      source_type: 'GOOGLE_PLACES_DISCOVERY',
      external_id: place.googlePlaceId,
      query_snapshot: {
        category: query.category,
        location: query.location,
        maxResults: query.maxResults,
        provider: 'google_places',
        discoveredAt: new Date().toISOString(),
      },
    });

    if (sourceError) {
      // Non bloccare la discovery se fallisce solo la provenance.
      console.error('lead_sources insert failed:', sourceError.message);
    }
  }

  const allIds = [...createdLeads.map((l) => l.id), ...duplicateIds];
  let leads: LeadRow[] = createdLeads;
  if (allIds.length > 0) {
    const { data: allLeads, error: fetchError } = await admin
      .from('leads')
      .select('*')
      .eq('workspace_id', workspace.id)
      .in('id', allIds)
      .order('created_at', { ascending: false });
    if (fetchError) {
      throw new Error(`Discovery: fetch lead fallito — ${fetchError.message}`);
    }
    leads = (allLeads ?? []) as LeadRow[];
  }

  return {
    found: places.length,
    created: createdLeads.length,
    duplicates: places.length - createdLeads.length,
    leads,
    query,
  };
}

export async function listWorkspaceLeads(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LeadRow[]> {
  const admin = createAdminSupabaseClient(env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data, error } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Leads: lettura fallita — ${error.message}`);
  }
  return (data ?? []) as LeadRow[];
}
