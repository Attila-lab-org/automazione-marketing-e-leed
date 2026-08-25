import type { SupabaseClient } from '@supabase/supabase-js';
import { getAiCommercialConfig } from '@/lib/ai/config';
import { getAICommercialProvider } from '@/lib/ai/run';
import { resolveModel } from '@/lib/ai/router';
import { estimateCostUsd } from '@/lib/ai/costs';
import { createSupabaseAiRunStore } from '@/lib/ai/persist';
import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { WebsiteAnalysis } from '@/lib/ai/commercial/schemas';
import { getCurrentPlaybook } from '@/lib/sales/playbook-store';

export function shouldUseAiOutbound(
  deliveryMode: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = getAiCommercialConfig(env);
  if (!config.outboundEnabled) return false;
  if (deliveryMode === 'TEST') return true;
  return config.outboundProduction;
}

export async function applyAiOutboundIfAllowed(args: {
  admin: SupabaseClient;
  workspaceId: string;
  campaignLeadId: string;
  deliveryMode: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): Promise<{ used: boolean; critic: string | null }> {
  const env = args.env ?? process.env;
  if (!shouldUseAiOutbound(args.deliveryMode, env)) {
    return { used: false, critic: null };
  }

  const { data: cl } = await args.admin
    .from('campaign_leads')
    .select('lead_id, demo_site_id, campaign_id')
    .eq('id', args.campaignLeadId)
    .maybeSingle();
  if (!cl) return { used: false, critic: null };

  const [{ data: lead }, { data: analysisRow }, { data: demo }] = await Promise.all([
    args.admin
      .from('leads')
      .select('name, city, rating, review_count')
      .eq('id', cl.lead_id)
      .maybeSingle(),
    args.admin
      .from('website_analyses')
      .select('analysis')
      .eq('lead_id', cl.lead_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    cl.demo_site_id
      ? args.admin.from('demo_sites').select('slug').eq('id', cl.demo_site_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!lead) return { used: false, critic: null };

  const playbook = await getCurrentPlaybook(args.admin as AppSupabaseClient, args.workspaceId);
  const demoUrl = demo?.slug ? `/demo/${demo.slug}` : null;
  const website = (analysisRow?.analysis as { website?: WebsiteAnalysis } | null)?.website ?? null;
  const facts = [
    lead.name,
    lead.city ?? '',
    lead.review_count != null ? `${lead.review_count} recensioni` : '',
    demoUrl ?? '',
  ].filter(Boolean);

  try {
    const provider = getAICommercialProvider(env);
    const writerRoute = resolveModel('draft_outbound', env);
    const draft = await provider.draftOutbound(
      {
        leadName: lead.name,
        city: lead.city,
        rating: lead.rating,
        reviewCount: lead.review_count,
        demoUrl,
        senderName: playbook.brand.signature,
        offerName: playbook.offer.key,
        verifiedFacts: facts,
        website,
      },
      { model: writerRoute.model },
    );
    const criticRoute = resolveModel('critique_outbound', env);
    const critic = await provider.critiqueOutbound(
      { draft: draft.output, facts },
      { model: criticRoute.model },
    );
    const persist = createSupabaseAiRunStore(args.admin as AppSupabaseClient);
    await persist({
      workspaceId: args.workspaceId,
      provider: getAiCommercialConfig(env).mode,
      model: draft.model,
      taskType: 'draft_outbound',
      leadId: cl.lead_id,
      campaignId: cl.campaign_id,
      usage: draft.usage,
      estimatedCostUsd: estimateCostUsd(draft.usage, writerRoute.tier, env),
      latencyMs: 0,
      status: 'ok',
    });
    await persist({
      workspaceId: args.workspaceId,
      provider: getAiCommercialConfig(env).mode,
      model: critic.model,
      taskType: 'critique_outbound',
      leadId: cl.lead_id,
      campaignId: cl.campaign_id,
      usage: critic.usage,
      estimatedCostUsd: estimateCostUsd(critic.usage, criticRoute.tier, env),
      latencyMs: 0,
      status: 'ok',
      meta: { verdict: critic.output.verdict },
    });

    if (critic.output.verdict !== 'PASS') {
      return { used: false, critic: critic.output.verdict };
    }

    await args.admin
      .from('message_drafts')
      .update({
        subject: draft.output.subject,
        body: draft.output.htmlBody,
        resolved_variables: {
          aiOutbound: true,
          claimsUsed: draft.output.claimsUsed,
          critic: critic.output,
          prompt_version: 'outbound-v1',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_lead_id', args.campaignLeadId)
      .eq('sequence_step', 0);
    return { used: true, critic: 'PASS' };
  } catch {
    return { used: false, critic: 'DEFERRED' };
  }
}
