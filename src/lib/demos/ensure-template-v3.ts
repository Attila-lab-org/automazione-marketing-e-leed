import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RESTAURANT_PREMIUM_V3_COMPONENT_VERSION,
  RESTAURANT_PREMIUM_V3_DEFAULTS,
  RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  RESTAURANT_PREMIUM_V3_SCHEMA,
  RESTAURANT_PREMIUM_V3_TEMPLATE_KEY,
} from '@/lib/templates/restaurant-premium-v3';

export async function ensureRestaurantPremiumV3(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<{ versionId: string; version: number; layoutKey: string }> {
  const { data: template, error: tError } = await admin
    .from('website_templates')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('key', RESTAURANT_PREMIUM_V3_TEMPLATE_KEY)
    .maybeSingle();

  if (tError) throw new Error(`Template V3: lettura fallita — ${tError.message}`);
  if (!template) {
    throw new Error('Template restaurant-premium non trovato — eseguire migration 0012+');
  }

  const { data: existing } = await admin
    .from('website_template_versions')
    .select('id, version, layout_key')
    .eq('template_id', template.id)
    .eq('layout_key', RESTAURANT_PREMIUM_V3_RENDERER_KEY)
    .eq('is_published', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      versionId: existing.id,
      version: existing.version,
      layoutKey: existing.layout_key,
    };
  }

  const { data: latest } = await admin
    .from('website_template_versions')
    .select('version')
    .eq('template_id', template.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;
  const { data: created, error: cError } = await admin
    .from('website_template_versions')
    .insert({
      workspace_id: workspaceId,
      template_id: template.id,
      version: nextVersion,
      layout_key: RESTAURANT_PREMIUM_V3_RENDERER_KEY,
      component_version: RESTAURANT_PREMIUM_V3_COMPONENT_VERSION,
      schema: RESTAURANT_PREMIUM_V3_SCHEMA,
      default_content: RESTAURANT_PREMIUM_V3_DEFAULTS,
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id, version, layout_key')
    .single();

  if (cError || !created) {
    throw new Error(`Template V3: insert versione fallita — ${cError?.message ?? 'no row'}`);
  }

  return {
    versionId: created.id,
    version: created.version,
    layoutKey: created.layout_key,
  };
}
