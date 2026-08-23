import type { SupabaseClient } from '@supabase/supabase-js';
import { generateShortId, makePublicSlug } from '@/lib/demos/slug';
import { pickCompatibleTemplateKey } from '@/lib/templates/match';
import { prefillFromLead, normalizeDemoData } from '@/lib/templates/merge';
import type { DemoInstanceData } from '@/lib/templates/restaurant-premium';
import type { LeadRow } from '@/lib/types/database';
import { ensureRestaurantPremium, listPublishedTemplates } from './ensure-template';

export interface CreateDemoInput {
  leadId: string;
  templateKey?: string;
}

export interface CreatedDemo {
  id: string;
  slug: string;
  publicPath: string;
  leadId: string;
  templateKey: string;
  templateVersionId: string;
  templateVersion: number;
  status: string;
  data: DemoInstanceData;
  reused: boolean;
}

function publicPath(slug: string): string {
  return `/demo/${slug}`;
}

export async function createDemoFromLead(
  admin: SupabaseClient,
  workspaceId: string,
  input: CreateDemoInput,
): Promise<CreatedDemo> {
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', input.leadId)
    .maybeSingle();

  if (leadError) throw new Error(`Demo: lettura lead fallita — ${leadError.message}`);
  if (!lead) throw new Error('Demo: lead non trovato');

  const typedLead = lead as LeadRow;
  if (typedLead.qualification_status === 'REJECTED') {
    throw new Error('Demo: lead rejected, creazione non consentita');
  }

  await ensureRestaurantPremium(admin, workspaceId);
  const published = await listPublishedTemplates(admin, workspaceId);
  const key =
    input.templateKey ??
    pickCompatibleTemplateKey(
      typedLead.category,
      published.map((t) => ({
        key: t.templateKey,
        vertical: t.vertical,
        published: true,
      })),
    );
  const template = published.find((t) => t.templateKey === key);
  if (!template) {
    throw new Error('Demo: nessun template pubblicato compatibile');
  }

  const { data: existing } = await admin
    .from('demo_sites')
    .select('id, slug, lead_id, template_id, template_version_id, status, current_version_id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', typedLead.id)
    .eq('template_id', template.templateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: versionRow } = await admin
      .from('demo_versions')
      .select('data')
      .eq('id', existing.current_version_id)
      .maybeSingle();
    return {
      id: existing.id,
      slug: existing.slug,
      publicPath: publicPath(existing.slug),
      leadId: existing.lead_id,
      templateKey: template.templateKey,
      templateVersionId: existing.template_version_id,
      templateVersion: template.version,
      status: existing.status,
      data: normalizeDemoData(versionRow?.data, normalizeDemoData(template.defaultContent)),
      reused: true,
    };
  }

  const defaults = normalizeDemoData(template.defaultContent);
  const data = prefillFromLead(
    {
      name: typedLead.name,
      phone: typedLead.phone,
      email: typedLead.email,
      address: typedLead.address,
      city: typedLead.city,
    },
    defaults,
  );

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shortId = generateShortId();
    const slug = makePublicSlug(typedLead.name, shortId);
    const { data: site, error: siteError } = await admin
      .from('demo_sites')
      .insert({
        workspace_id: workspaceId,
        lead_id: typedLead.id,
        template_id: template.templateId,
        template_version_id: template.versionId,
        slug,
        short_id: shortId,
        public_url: publicPath(slug),
        status: 'DRAFT',
        noindex: true,
      })
      .select('id, slug, lead_id, template_version_id, status')
      .single();

    if (siteError || !site) {
      lastError = new Error(`Demo: insert fallito — ${siteError?.message ?? 'no row'}`);
      if (siteError?.code === '23505') continue;
      throw lastError;
    }

    const { data: version, error: versionError } = await admin
      .from('demo_versions')
      .insert({
        workspace_id: workspaceId,
        demo_site_id: site.id,
        version: 1,
        data,
        is_published: false,
      })
      .select('id')
      .single();

    if (versionError || !version) {
      await admin.from('demo_sites').delete().eq('id', site.id);
      throw new Error(`Demo: versione iniziale fallita — ${versionError?.message ?? 'no row'}`);
    }

    const { error: linkError } = await admin
      .from('demo_sites')
      .update({ current_version_id: version.id })
      .eq('id', site.id);

    if (linkError) {
      throw new Error(`Demo: collegamento versione fallito — ${linkError.message}`);
    }

    return {
      id: site.id,
      slug: site.slug,
      publicPath: publicPath(site.slug),
      leadId: site.lead_id,
      templateKey: template.templateKey,
      templateVersionId: site.template_version_id,
      templateVersion: template.version,
      status: site.status,
      data,
      reused: false,
    };
  }

  throw lastError ?? new Error('Demo: impossibile assegnare uno slug univoco');
}
