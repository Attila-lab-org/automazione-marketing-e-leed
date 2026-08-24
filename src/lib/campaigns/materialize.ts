import type { SupabaseClient } from '@supabase/supabase-js';
import { RESTAURANT_PREMIUM_V3_RENDERER_KEY } from '@/lib/templates/restaurant-premium-v3';
import { pickCompatibleTemplateKey } from '@/lib/templates/match';
import { listPublishedTemplates } from '@/lib/demos/ensure-template';
import { ensureRestaurantPremiumV3 } from '@/lib/demos/ensure-template-v3';
import type { PolicyMode } from '@/lib/types/database';

export interface CreateCampaignInput {
  name: string;
  leadIds: string[];
  mode?: PolicyMode;
  rateLimitPerHour?: number;
  dailySendLimit?: number;
  sendWindow?: Record<string, unknown>;
  landingLayoutKey?: string;
}

const DEFAULT_POLICY_ACTIONS = {
  discovery: 'OFF',
  enrichment: 'AUTO',
  website_analysis: 'OFF',
  demo_generation: 'AUTO',
  screenshot: 'OFF',
  message_generation: 'AUTO',
  send: 'MANUAL',
  followup: 'AUTO',
};

export async function createCampaignWithLeads(
  admin: SupabaseClient,
  workspaceId: string,
  input: CreateCampaignInput,
) {
  if (!input.leadIds.length) throw new Error('Seleziona almeno un lead');

  await ensureRestaurantPremiumV3(admin, workspaceId);
  const published = await listPublishedTemplates(admin, workspaceId);
  const layoutKey = input.landingLayoutKey ?? RESTAURANT_PREMIUM_V3_RENDERER_KEY;

  const { data: templateVersion, error: tvError } = await admin
    .from('website_template_versions')
    .select('id, template_id, layout_key')
    .eq('workspace_id', workspaceId)
    .eq('layout_key', layoutKey)
    .eq('is_published', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tvError || !templateVersion) {
    throw new Error(`Template ${layoutKey} non pubblicato`);
  }

  const { data: templateMeta } = await admin
    .from('website_templates')
    .select('id, key, vertical')
    .eq('id', templateVersion.template_id)
    .single();

  // Explicit visual-intro + Standard 0-3-7 (not "latest global")
  const { data: msgTemplate } = await admin
    .from('message_templates')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('key', 'visual-intro-v1')
    .maybeSingle();

  const { data: msgVersion } = msgTemplate
    ? await admin
        .from('message_template_versions')
        .select('id, template_id')
        .eq('template_id', msgTemplate.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: seq } = await admin
    .from('followup_sequences')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'Standard 0-3-7')
    .maybeSingle();

  const { data: seqVersion } = seq
    ? await admin
        .from('followup_sequence_versions')
        .select('id, sequence_id')
        .eq('sequence_id', seq.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: campaign, error: cError } = await admin
    .from('campaigns')
    .insert({
      workspace_id: workspaceId,
      name: input.name.trim(),
      landing_template_id: templateVersion.template_id,
      landing_template_version_id: templateVersion.id,
      message_template_id: msgVersion?.template_id ?? null,
      message_template_version_id: msgVersion?.id ?? null,
      followup_sequence_id: seqVersion?.sequence_id ?? null,
      followup_sequence_version_id: seqVersion?.id ?? null,
      mode: input.mode ?? 'MANUAL',
      status: 'DRAFT',
      rate_limit_per_hour: input.rateLimitPerHour ?? 20,
      daily_send_limit: input.dailySendLimit ?? 100,
      send_window: input.sendWindow ?? { timezone: 'Europe/Rome', start: '09:00', end: '18:00' },
    })
    .select('id')
    .single();

  if (cError || !campaign) throw new Error(`Campagna: creazione fallita — ${cError?.message ?? ''}`);

  const { data: policy, error: pError } = await admin
    .from('campaign_policy_versions')
    .insert({
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      version: 1,
      mode: input.mode ?? 'MANUAL',
      actions: DEFAULT_POLICY_ACTIONS,
      thresholds: {},
      rate_limit: { per_hour: input.rateLimitPerHour ?? 20 },
      send_window: input.sendWindow ?? {},
      daily_limit: input.dailySendLimit ?? 100,
      is_active: true,
    })
    .select('id, mode, actions, thresholds, rate_limit, send_window, daily_limit')
    .single();

  if (pError || !policy) throw new Error(`Campagna: policy fallita — ${pError?.message ?? ''}`);

  await admin
    .from('campaigns')
    .update({ active_policy_version_id: policy.id })
    .eq('id', campaign.id);

  const policySnapshot = {
    policyVersionId: policy.id,
    mode: policy.mode,
    actions: policy.actions,
    thresholds: policy.thresholds,
    rateLimit: policy.rate_limit,
    sendWindow: policy.send_window,
    dailyLimit: policy.daily_limit,
    landingLayoutKey: layoutKey,
  };

  const { data: leads } = await admin
    .from('leads')
    .select('id, category')
    .eq('workspace_id', workspaceId)
    .in('id', input.leadIds);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const candidates = published.map((t) => ({
    key: t.templateKey,
    vertical: t.vertical,
    published: true,
  }));

  const rows = input.leadIds.map((leadId) => {
    const lead = leadById.get(leadId);
    const matched = pickCompatibleTemplateKey(lead?.category, candidates);
    const compatible =
      matched != null &&
      matched === (templateMeta?.key ?? matched) &&
      (templateMeta?.vertical == null ||
        pickCompatibleTemplateKey(lead?.category, [
          {
            key: templateMeta.key,
            vertical: templateMeta.vertical,
            published: true,
          },
        ]) === templateMeta.key);

    if (!compatible) {
      return {
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        lead_id: leadId,
        status: 'SKIPPED',
        policy_version_id: policy.id,
        policy_snapshot: policySnapshot,
        sequence_step: 0,
        preparation: {
          blockers: ['TEMPLATE_NOT_COMPATIBLE'],
          leadCategory: lead?.category ?? null,
          requiredLayoutKey: layoutKey,
        },
      };
    }

    return {
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      lead_id: leadId,
      status: 'PENDING',
      policy_version_id: policy.id,
      policy_snapshot: policySnapshot,
      sequence_step: 0,
      preparation: { templateMatch: matched },
    };
  });

  const { error: clError } = await admin.from('campaign_leads').insert(rows);
  if (clError) throw new Error(`Campagna: materializzazione lead fallita — ${clError.message}`);

  const eligible = rows.filter((r) => r.status === 'PENDING').length;
  const skipped = rows.filter((r) => r.status === 'SKIPPED').length;

  return {
    campaignId: campaign.id,
    leadCount: input.leadIds.length,
    eligible,
    skipped,
    layoutKey,
  };
}
