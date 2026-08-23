import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeDemoInstanceData } from '@/lib/templates/merge';
import { resolveRendererKey } from '@/lib/templates/registry';
import type { DemoInstanceData } from '@/lib/templates/restaurant-premium';
import type { LeadRow } from '@/lib/types/database';

export interface LoadedDemo {
  id: string;
  slug: string;
  publicPath: string;
  status: string;
  noindex: boolean;
  lead: Pick<LeadRow, 'id' | 'name' | 'category' | 'city' | 'phone' | 'email' | 'address' | 'website_url'>;
  template: {
    id: string;
    key: string;
    name: string;
    vertical: string | null;
    versionId: string;
    version: number;
    layoutKey: string;
    schema: unknown;
    defaultContent: unknown;
  };
  data: DemoInstanceData;
  rendererKey: ReturnType<typeof resolveRendererKey>;
}

function asLead(row: Record<string, unknown>): LoadedDemo['lead'] {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: (row.category as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    website_url: (row.website_url as string | null) ?? null,
  };
}

async function hydrateDemo(
  admin: SupabaseClient,
  site: Record<string, unknown>,
): Promise<LoadedDemo> {
  const { data: template, error: tError } = await admin
    .from('website_templates')
    .select('id, key, name, category, vertical')
    .eq('id', site.template_id)
    .single();
  if (tError || !template) {
    throw new Error(`Demo: template non trovato — ${tError?.message ?? 'missing'}`);
  }

  const { data: version, error: vError } = await admin
    .from('website_template_versions')
    .select('id, version, layout_key, schema, default_content')
    .eq('id', site.template_version_id)
    .single();
  if (vError || !version) {
    throw new Error(`Demo: versione template non trovata — ${vError?.message ?? 'missing'}`);
  }

  const { data: lead, error: lError } = await admin
    .from('leads')
    .select('id, name, category, city, phone, email, address, website_url')
    .eq('id', site.lead_id)
    .single();
  if (lError || !lead) {
    throw new Error(`Demo: lead non trovato — ${lError?.message ?? 'missing'}`);
  }

  let stored: unknown = {};
  if (site.current_version_id) {
    const { data: demoVersion } = await admin
      .from('demo_versions')
      .select('data')
      .eq('id', site.current_version_id)
      .maybeSingle();
    stored = demoVersion?.data ?? {};
  }

  const leadRow = asLead(lead as Record<string, unknown>);
  const data = mergeDemoInstanceData({
    templateDefaults: version.default_content,
    lead: {
      name: leadRow.name,
      phone: leadRow.phone,
      email: leadRow.email,
      address: leadRow.address,
      city: leadRow.city,
    },
    overrides: stored,
  });

  const tpl = template as { vertical?: string | null; category: string | null; key: string; name: string | null; id: string };
  return {
    id: String(site.id),
    slug: String(site.slug),
    publicPath: `/demo/${site.slug}`,
    status: String(site.status),
    noindex: Boolean(site.noindex),
    lead: leadRow,
    template: {
      id: tpl.id,
      key: tpl.key,
      name: tpl.name ?? tpl.key,
      vertical: tpl.vertical ?? tpl.category,
      versionId: version.id,
      version: version.version,
      layoutKey: version.layout_key,
      schema: version.schema,
      defaultContent: version.default_content,
    },
    data,
    rendererKey: resolveRendererKey(version.layout_key),
  };
}

export async function loadDemoById(
  admin: SupabaseClient,
  workspaceId: string,
  id: string,
): Promise<LoadedDemo | null> {
  const { data: site, error } = await admin
    .from('demo_sites')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Demo: lettura fallita — ${error.message}`);
  if (!site) return null;
  return hydrateDemo(admin, site as Record<string, unknown>);
}

export async function loadDemoBySlug(
  admin: SupabaseClient,
  slug: string,
): Promise<LoadedDemo | null> {
  const { data: site, error } = await admin
    .from('demo_sites')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Demo: lettura pubblica fallita — ${error.message}`);
  if (!site) return null;
  if (site.status === 'DISABLED' || site.status === 'EXPIRED') return null;
  return hydrateDemo(admin, site as Record<string, unknown>);
}

export interface DemoListItem {
  id: string;
  slug: string;
  publicPath: string;
  status: string;
  leadName: string;
  leadCity: string | null;
  templateName: string;
  templateKey: string;
  templateVersion: number;
  createdAt: string;
  updatedAt: string;
}

export async function listDemos(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<DemoListItem[]> {
  const { data: sites, error } = await admin
    .from('demo_sites')
    .select('id, slug, status, lead_id, template_id, template_version_id, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Demo: elenco fallito — ${error.message}`);
  if (!sites?.length) return [];

  const leadIds = [...new Set(sites.map((s) => s.lead_id))];
  const templateIds = [...new Set(sites.map((s) => s.template_id))];
  const versionIds = [...new Set(sites.map((s) => s.template_version_id))];

  const [{ data: leads }, { data: templates }, { data: versions }] = await Promise.all([
    admin.from('leads').select('id, name, city').in('id', leadIds),
    admin.from('website_templates').select('id, key, name').in('id', templateIds),
    admin.from('website_template_versions').select('id, version').in('id', versionIds),
  ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const tplMap = new Map((templates ?? []).map((t) => [t.id, t]));
  const verMap = new Map((versions ?? []).map((v) => [v.id, v]));

  return sites.map((s) => {
    const lead = leadMap.get(s.lead_id);
    const tpl = tplMap.get(s.template_id);
    const ver = verMap.get(s.template_version_id);
    return {
      id: s.id,
      slug: s.slug,
      publicPath: `/demo/${s.slug}`,
      status: s.status,
      leadName: lead?.name ?? 'Lead',
      leadCity: lead?.city ?? null,
      templateName: tpl?.name ?? tpl?.key ?? 'template',
      templateKey: tpl?.key ?? '',
      templateVersion: ver?.version ?? 0,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  });
}
