import { NextResponse } from 'next/server';
import { ensureRestaurantPremium, listPublishedTemplates } from '@/lib/demos/ensure-template';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase non configurato', templates: [] }, { status: 503 });
    }
    const admin = createAdminSupabaseClient(process.env);
    const workspace = await ensureDefaultWorkspace(admin);
    await ensureRestaurantPremium(admin, workspace.id);

    const { data: catalog, error } = await admin
      .from('website_templates')
      .select('id, key, name, description, category, vertical, status, created_at, updated_at')
      .eq('workspace_id', workspace.id)
      .order('name');
    if (error) throw new Error(error.message);

    const { data: versions, error: vError } = await admin
      .from('website_template_versions')
      .select('id, template_id, version, layout_key, is_published, published_at, created_at')
      .eq('workspace_id', workspace.id)
      .order('version', { ascending: false });
    if (vError) throw new Error(vError.message);

    const { data: demos, error: dError } = await admin
      .from('demo_sites')
      .select('id, template_id, template_version_id')
      .eq('workspace_id', workspace.id);
    if (dError) throw new Error(dError.message);

    const published = await listPublishedTemplates(admin, workspace.id);

    const templates = (catalog ?? []).map((t) => {
      const tVersions = (versions ?? []).filter((v) => v.template_id === t.id);
      const latest = tVersions[0] ?? null;
      const publishedVersion = published.find((p) => p.templateId === t.id);
      const row = t as { vertical?: string | null; status: string };
      const archived = row.status === 'ARCHIVED';
      const status = archived ? 'archived' : publishedVersion ? 'published' : 'draft';
      const demoCount = (demos ?? []).filter((d) => d.template_id === t.id).length;
      return {
        id: t.id,
        key: t.key,
        name: t.name ?? t.key,
        description: t.description,
        vertical: row.vertical ?? t.category,
        status,
        latestVersion: latest?.version ?? null,
        publishedVersion: publishedVersion?.version ?? null,
        rendererKey: publishedVersion?.layoutKey ?? latest?.layout_key ?? null,
        demoCount,
        previewPath: publishedVersion ? `/templates?preview=${t.key}` : null,
      };
    });

    return NextResponse.json({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Elenco template fallito';
    return NextResponse.json({ error: message, templates: [] }, { status: 500 });
  }
}
