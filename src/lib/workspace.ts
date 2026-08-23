/**
 * Workspace bootstrap — Phase 2 Slice 1.
 * Senza auth UI ancora, usiamo un workspace di sistema creato via service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_WORKSPACE_SLUG = 'sales-os';
export const DEFAULT_WORKSPACE_NAME = 'Sales Automation OS';

export async function ensureDefaultWorkspace(
  admin: SupabaseClient,
): Promise<{ id: string; slug: string; name: string }> {
  const { data: existing, error: selectError } = await admin
    .from('workspaces')
    .select('id, slug, name')
    .eq('slug', DEFAULT_WORKSPACE_SLUG)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Workspace: lettura fallita — ${selectError.message}`);
  }
  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await admin
    .from('workspaces')
    .insert({
      name: DEFAULT_WORKSPACE_NAME,
      slug: DEFAULT_WORKSPACE_SLUG,
      default_policy_mode: 'MANUAL',
      default_policy: {},
      settings: { bootstrap: 'slice1' },
    })
    .select('id, slug, name')
    .single();

  if (insertError) {
    // Race: un altro request potrebbe aver creato il workspace.
    const { data: raced, error: raceError } = await admin
      .from('workspaces')
      .select('id, slug, name')
      .eq('slug', DEFAULT_WORKSPACE_SLUG)
      .maybeSingle();
    if (raced) return raced;
    throw new Error(
      `Workspace: creazione fallita — ${insertError.message}${raceError ? ` / ${raceError.message}` : ''}`,
    );
  }

  return created;
}
