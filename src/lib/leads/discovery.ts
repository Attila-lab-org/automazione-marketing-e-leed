/**
 * Discovery Google Places → dedupe Place ID → persist → qualify → cost event.
 * Phase B: nessuna email, nessun outreach, nessuna AI/browser.
 */

import { getGooglePlacesProvider } from '@/lib/providers/google-places';
import type { DiscoveredPlace, DiscoveryQuery } from '@/lib/providers/google-places/types';
import { createAdminSupabaseClient } from '@/lib/supabase/client';
import type { LeadRow } from '@/lib/types/database';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { discoveredPlaceToLeadInsert } from './normalize';
import {
  ESTIMATED_COST_USD,
  qualifyLeadsBulk,
  recordCostEvent,
} from './qualify';

/** Max risultati discovery (Places pageSize≤20 → paginazione lato adapter). */
export const DISCOVERY_MAX_RESULTS = 50;

export type DiscoveryInput = {
  category: string;
  location: string;
  maxResults?: number;
};

export type DiscoveryResult = {
  found: number;
  created: number;
  duplicates: number;
  qualified: number;
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

  let maxResults = Math.min(5, DISCOVERY_MAX_RESULTS);
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

function isFixturePlace(place: DiscoveredPlace): boolean {
  return (
    place.googlePlaceId.startsWith('mock-place-') ||
    Boolean(place.websiteUrl?.includes('example.com'))
  );
}

export async function runLeadDiscovery(
  input: DiscoveryInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DiscoveryResult> {
  const query: DiscoveryQuery = {
    category: input.category,
    location: input.location,
    maxResults: input.maxResults ?? 5,
  };

  const admin = createAdminSupabaseClient(env);
  const workspace = await ensureDefaultWorkspace(admin);
  const provider = getGooglePlacesProvider(env);
  const mode = (env.GOOGLE_PLACES_PROVIDER_MODE ?? 'mock').toLowerCase();
  let places = await provider.searchMinimal(query);

  // In live mode non persistere mai risultati fixture/mock.
  if (mode === 'live') {
    places = places.filter((p) => !isFixturePlace(p));
  }

  if (places.length === 0) {
    return { found: 0, created: 0, duplicates: 0, qualified: 0, leads: [], query };
  }

  await recordCostEvent(admin, {
    workspace_id: workspace.id,
    provider: 'google_places',
    operation: 'discovery',
    entity_type: 'discovery_run',
    quantity: places.length,
    estimated_cost_usd:
      places.length * ESTIMATED_COST_USD['google_places.discovery_per_result'],
    meta: {
      category: query.category,
      location: query.location,
      maxResults: query.maxResults,
      mode,
    },
  });

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
      console.error('lead_sources insert failed:', sourceError.message);
    }
  }

  // Qualifica automatica: nuovi + duplicati del batch (ricalcolo idempotente).
  const allIds = [...createdLeads.map((l) => l.id), ...duplicateIds];
  let leads: LeadRow[] = createdLeads;
  let qualified = 0;

  if (allIds.length > 0) {
    const { data: allLeads, error: fetchError } = await admin
      .from('leads')
      .select('*')
      .eq('workspace_id', workspace.id)
      .in('id', allIds);

    if (fetchError) {
      throw new Error(`Discovery: fetch lead fallito — ${fetchError.message}`);
    }

    const toQualify = (allLeads ?? []) as LeadRow[];
    const qual = await qualifyLeadsBulk(admin, toQualify);
    qualified = qual.qualified;
    leads = qual.leads.sort(
      (a, b) => (b.discovery_score ?? 0) - (a.discovery_score ?? 0),
    );

    await recordCostEvent(admin, {
      workspace_id: workspace.id,
      provider: 'internal',
      operation: 'qualification',
      entity_type: 'discovery_run',
      quantity: qualified,
      estimated_cost_usd: 0,
      meta: { algorithm: 'discovery-qual-v1.0' },
    });
  }

  return {
    found: places.length,
    created: createdLeads.length,
    duplicates: places.length - createdLeads.length,
    qualified,
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
    .order('discovery_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Leads: lettura fallita — ${error.message}`);
  }
  return (data ?? []) as LeadRow[];
}

/** Qualifica tutti i lead del workspace ancora NEW o senza score. */
export async function qualifyWorkspaceLeads(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ qualified: number }> {
  const admin = createAdminSupabaseClient(env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data, error } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspace.id)
    .limit(2000);

  if (error) throw new Error(`Qualify: lettura fallita — ${error.message}`);
  const result = await qualifyLeadsBulk(admin, (data ?? []) as LeadRow[]);
  return { qualified: result.qualified };
}
