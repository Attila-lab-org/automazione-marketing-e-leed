import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RESTAURANT_PREMIUM_COMPONENT_VERSION,
  RESTAURANT_PREMIUM_DEFAULTS,
  RESTAURANT_PREMIUM_RENDERER_KEY,
  RESTAURANT_PREMIUM_SCHEMA,
  RESTAURANT_PREMIUM_TEMPLATE_KEY,
} from '@/lib/templates/restaurant-premium';

export interface PublishedTemplate {
  templateId: string;
  templateKey: string;
  templateName: string;
  vertical: string | null;
  versionId: string;
  version: number;
  layoutKey: string;
  defaultContent: unknown;
  schema: unknown;
}

export async function listPublishedTemplates(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<PublishedTemplate[]> {
  const { data: templates, error } = await admin
    .from('website_templates')
    .select('id, key, name, category, vertical, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`Template: lettura catalogo fallita — ${error.message}`);
  if (!templates?.length) return [];

  const ids = templates.map((t) => t.id);
  const { data: versions, error: vError } = await admin
    .from('website_template_versions')
    .select('id, template_id, version, layout_key, default_content, schema, is_published')
    .in('template_id', ids)
    .eq('is_published', true)
    .order('version', { ascending: false });

  if (vError) throw new Error(`Template: lettura versioni fallita — ${vError.message}`);

  const latestByTemplate = new Map<string, NonNullable<typeof versions>[number]>();
  for (const v of versions ?? []) {
    if (!latestByTemplate.has(v.template_id)) latestByTemplate.set(v.template_id, v);
  }

  return templates.flatMap((t) => {
    const v = latestByTemplate.get(t.id);
    if (!v) return [];
    const row = t as { vertical?: string | null; category: string | null };
    return [
      {
        templateId: t.id,
        templateKey: t.key,
        templateName: t.name ?? t.key,
        vertical: row.vertical ?? t.category,
        versionId: v.id,
        version: v.version,
        layoutKey: v.layout_key,
        defaultContent: v.default_content,
        schema: v.schema,
      },
    ];
  });
}

/** Idempotente: garantisce Restaurant Premium pubblicato nel workspace. */
export async function ensureRestaurantPremium(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<PublishedTemplate> {
  const existing = (await listPublishedTemplates(admin, workspaceId)).find(
    (t) => t.templateKey === RESTAURANT_PREMIUM_TEMPLATE_KEY,
  );
  if (existing) return existing;

  const { data: template, error: tError } = await admin
    .from('website_templates')
    .upsert(
      {
        workspace_id: workspaceId,
        key: RESTAURANT_PREMIUM_TEMPLATE_KEY,
        name: 'Restaurant Premium',
        description:
          'Master template tecnico per attività food/ristorazione. Design commerciale definitivo in uno slice successivo.',
        category: 'restaurant',
        vertical: 'restaurant',
        status: 'ACTIVE',
      },
      { onConflict: 'workspace_id,key' },
    )
    .select('id, key, name, category, vertical')
    .single();

  if (tError || !template) {
    throw new Error(`Template: upsert Restaurant Premium fallito — ${tError?.message ?? 'no row'}`);
  }

  const { data: version, error: vError } = await admin
    .from('website_template_versions')
    .upsert(
      {
        workspace_id: workspaceId,
        template_id: template.id,
        version: 1,
        layout_key: RESTAURANT_PREMIUM_RENDERER_KEY,
        component_version: RESTAURANT_PREMIUM_COMPONENT_VERSION,
        schema: RESTAURANT_PREMIUM_SCHEMA,
        default_content: RESTAURANT_PREMIUM_DEFAULTS,
        is_published: true,
        published_at: new Date().toISOString(),
      },
      { onConflict: 'template_id,version' },
    )
    .select('id, template_id, version, layout_key, default_content, schema')
    .single();

  if (vError || !version) {
    throw new Error(`Template: versione Restaurant Premium fallita — ${vError?.message ?? 'no row'}`);
  }

  return {
    templateId: template.id,
    templateKey: template.key,
    templateName: template.name ?? template.key,
    vertical: (template as { vertical?: string | null }).vertical ?? template.category,
    versionId: version.id,
    version: version.version,
    layoutKey: version.layout_key,
    defaultContent: version.default_content,
    schema: version.schema,
  };
}
