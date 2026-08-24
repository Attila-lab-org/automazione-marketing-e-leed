import type { SupabaseClient } from '@supabase/supabase-js';
import { applyEditorPatch } from '@/lib/templates/merge';
import { applyEditorPatchV2 } from '@/lib/templates/merge-v2';
import { applyEditorPatchV3 } from '@/lib/templates/merge-v3';
import type { DemoInstanceData } from '@/lib/templates/restaurant-premium';
import {
  RESTAURANT_PREMIUM_V2_RENDERER_KEY,
  type DemoInstanceDataV2,
} from '@/lib/templates/restaurant-premium-v2';
import {
  RESTAURANT_PREMIUM_V3_RENDERER_KEY,
  type DemoInstanceDataV3,
} from '@/lib/templates/restaurant-premium-v3';
import { loadDemoById } from './load';

export async function updateDemoContent(
  admin: SupabaseClient,
  workspaceId: string,
  demoId: string,
  patch: Partial<{
    branding: Record<string, unknown>;
    content: Record<string, unknown>;
    contact: Record<string, unknown>;
    signals: Record<string, unknown>;
  }>,
) {
  const current = await loadDemoById(admin, workspaceId, demoId);
  if (!current) throw new Error('Demo: non trovata');

  const next =
    current.rendererKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY
      ? applyEditorPatchV3(current.data as DemoInstanceDataV3, {
          branding: patch.branding as Partial<DemoInstanceDataV3['branding']>,
          content: patch.content as Partial<DemoInstanceDataV3['content']>,
          contact: patch.contact as Partial<DemoInstanceDataV3['contact']>,
          signals: patch.signals as Partial<DemoInstanceDataV3['signals']>,
        })
      : current.rendererKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY
        ? applyEditorPatchV2(current.data as DemoInstanceDataV2, {
            branding: patch.branding as Partial<DemoInstanceDataV2['branding']>,
            content: patch.content as Partial<DemoInstanceDataV2['content']>,
            contact: patch.contact as Partial<DemoInstanceDataV2['contact']>,
            signals: patch.signals as Partial<DemoInstanceDataV2['signals']>,
          })
        : applyEditorPatch(current.data as DemoInstanceData, {
            branding: patch.branding as Partial<DemoInstanceData['branding']>,
            content: patch.content as Partial<DemoInstanceData['content']>,
            contact: patch.contact as Partial<DemoInstanceData['contact']>,
          });

  const { data: site, error: siteError } = await admin
    .from('demo_sites')
    .select('id, current_version_id')
    .eq('id', demoId)
    .eq('workspace_id', workspaceId)
    .single();

  if (siteError || !site) throw new Error(`Demo: update lettura fallita — ${siteError?.message}`);

  if (site.current_version_id) {
    const { data: versionMeta, error: metaError } = await admin
      .from('demo_versions')
      .select('id, is_published')
      .eq('id', site.current_version_id)
      .single();
    if (metaError) throw new Error(`Demo: versione corrente illeggibile — ${metaError.message}`);

    if (versionMeta && !versionMeta.is_published) {
      const { error: updError } = await admin
        .from('demo_versions')
        .update({ data: next })
        .eq('id', versionMeta.id);
      if (updError) throw new Error(`Demo: salvataggio fallito — ${updError.message}`);
      return loadDemoById(admin, workspaceId, demoId);
    }
  }

  const { data: latest } = await admin
    .from('demo_versions')
    .select('version')
    .eq('demo_site_id', demoId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error: insertError } = await admin
    .from('demo_versions')
    .insert({
      workspace_id: workspaceId,
      demo_site_id: demoId,
      version: (latest?.version ?? 0) + 1,
      data: next,
      is_published: false,
    })
    .select('id')
    .single();

  if (insertError || !created) {
    throw new Error(`Demo: nuova versione fallita — ${insertError?.message ?? 'no row'}`);
  }

  const { error: linkError } = await admin
    .from('demo_sites')
    .update({ current_version_id: created.id })
    .eq('id', demoId);
  if (linkError) throw new Error(`Demo: aggiornamento puntatore fallito — ${linkError.message}`);

  return loadDemoById(admin, workspaceId, demoId);
}
