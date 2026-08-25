import type { SupabaseClient } from '@supabase/supabase-js';
import { generateShortId, makePublicSlug } from '@/lib/demos/slug';
import { ensureRestaurantPremiumV2 } from '@/lib/demos/ensure-template-v2';
import { ensureRestaurantPremiumV3 } from '@/lib/demos/ensure-template-v3';
import { listPublishedTemplates } from '@/lib/demos/ensure-template';
import { pickCompatibleTemplateKey } from '@/lib/templates/match';
import { prefillFromLead, normalizeDemoData } from '@/lib/templates/merge';
import { prefillFromLeadV2, normalizeDemoDataV2 } from '@/lib/templates/merge-v2';
import {
  normalizeDemoDataV3,
  personalizeDemoFromWebsiteAnalysisV3,
  prefillFromLeadV3,
} from '@/lib/templates/merge-v3';
import { RESTAURANT_PREMIUM_RENDERER_KEY } from '@/lib/templates/restaurant-premium';
import { RESTAURANT_PREMIUM_V2_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v2';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import type { LeadRow } from '@/lib/types/database';

export interface CreateDemoInput {
  leadId: string;
  templateKey?: string;
  layoutKey?: string;
}

export interface CreatedDemo {
  id: string;
  slug: string;
  publicPath: string;
  leadId: string;
  templateKey: string;
  layoutKey: string;
  templateVersionId: string;
  templateVersion: number;
  status: string;
  data: unknown;
  reused: boolean;
}

function publicPath(slug: string): string {
  return `/demo/${slug}`;
}

function normalizeForLayout(layoutKey: string, raw: unknown, defaults: unknown) {
  if (layoutKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY) {
    return normalizeDemoDataV3(raw, normalizeDemoDataV3(defaults));
  }
  if (layoutKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
    return normalizeDemoDataV2(raw, normalizeDemoDataV2(defaults));
  }
  return normalizeDemoData(raw, normalizeDemoData(defaults));
}

function prefillForLayout(
  layoutKey: string,
  leadInput: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    rating: number | null;
    reviewCount: number | null;
  },
  defaults: unknown,
) {
  if (layoutKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY) {
    return prefillFromLeadV3(leadInput, normalizeDemoDataV3(defaults));
  }
  if (layoutKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) {
    return prefillFromLeadV2(leadInput, normalizeDemoDataV2(defaults));
  }
  return prefillFromLead(leadInput, normalizeDemoData(defaults));
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

  await ensureRestaurantPremiumV2(admin, workspaceId);
  await ensureRestaurantPremiumV3(admin, workspaceId);
  const published = await listPublishedTemplates(admin, workspaceId);

  let template = input.layoutKey
    ? published.find((t) => t.layoutKey === input.layoutKey)
    : undefined;

  if (!template && input.templateKey) {
    template = published.find((t) => t.templateKey === input.templateKey);
  }

  if (!template) {
    const key = pickCompatibleTemplateKey(
      typedLead.category,
      published.map((t) => ({ key: t.templateKey, vertical: t.vertical, published: true })),
    );
    if (!key) {
      throw new Error('Demo: nessun template compatibile col verticale del lead');
    }
    template =
      published.find((t) => t.templateKey === key && t.layoutKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY) ??
      published.find((t) => t.templateKey === key && t.layoutKey === RESTAURANT_PREMIUM_V2_RENDERER_KEY) ??
      published.find((t) => t.templateKey === key && t.layoutKey === RESTAURANT_PREMIUM_RENDERER_KEY) ??
      published.find((t) => t.templateKey === key);
  }

  if (!template) {
    throw new Error('Demo: nessun template pubblicato compatibile');
  }

  const { data: existing } = await admin
    .from('demo_sites')
    .select('id, slug, lead_id, template_id, template_version_id, status, current_version_id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', typedLead.id)
    .eq('template_version_id', template.versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: versionRow } = await admin
      .from('demo_versions')
      .select('data')
      .eq('id', existing.current_version_id)
      .maybeSingle();
    const data = normalizeForLayout(template.layoutKey, versionRow?.data, template.defaultContent);
    return {
      id: existing.id,
      slug: existing.slug,
      publicPath: publicPath(existing.slug),
      leadId: existing.lead_id,
      templateKey: template.templateKey,
      layoutKey: template.layoutKey,
      templateVersionId: existing.template_version_id,
      templateVersion: template.version,
      status: existing.status,
      data,
      reused: true,
    };
  }

  const leadInput = {
    name: typedLead.name,
    phone: typedLead.phone,
    email: typedLead.email,
    address: typedLead.address,
    city: typedLead.city,
    rating: typedLead.rating,
    reviewCount: typedLead.review_count,
  };

  let data = prefillForLayout(template.layoutKey, leadInput, template.defaultContent);
  if (template.layoutKey === RESTAURANT_PREMIUM_V3_RENDERER_KEY) {
    const { data: analysis } = await admin
      .from('website_analyses')
      .select('confidence, human_review_required, strengths, issues')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', typedLead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analysis) {
      data = personalizeDemoFromWebsiteAnalysisV3(normalizeDemoDataV3(data), analysis);
    }
  }

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
      layoutKey: template.layoutKey,
      templateVersionId: site.template_version_id,
      templateVersion: template.version,
      status: site.status,
      data,
      reused: false,
    };
  }

  throw lastError ?? new Error('Demo: impossibile assegnare uno slug univoco');
}
