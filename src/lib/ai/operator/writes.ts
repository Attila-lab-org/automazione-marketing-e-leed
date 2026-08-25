import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { createCampaignWithLeads } from '@/lib/campaigns/materialize';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { resumeCampaign } from '@/lib/campaigns/resume';
import { parseTestRecipientAllowlist } from '@/lib/campaigns/test-delivery';
import { analyzeLeadWebsite } from '@/lib/intelligence/analyze';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import { createPendingAction } from './pending';
import { CAMPAIGN_MUTATION_CAPABILITIES } from './capabilities';
import type { OperatorIntent } from './intent';
import type { CampaignDetail, LeadSearchHit } from './registry';

export type WriteResult = {
  tool: string;
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

export async function recordAiAudit(
  admin: AppSupabaseClient,
  args: {
    workspaceId: string;
    actor: 'AI' | 'HUMAN' | 'SYSTEM';
    tool: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    confirmationId?: string | null;
    result?: Record<string, unknown>;
  },
) {
  await admin.from('ai_action_audit').insert({
    workspace_id: args.workspaceId,
    actor: args.actor,
    tool: args.tool,
    entity_type: args.entityType ?? null,
    entity_id: args.entityId ?? null,
    action: args.action,
    confirmation_id: args.confirmationId ?? null,
    result: (args.result ?? {}) as Json,
  });
}

export async function pauseCampaign(
  admin: AppSupabaseClient,
  workspaceId: string,
  campaignId: string,
) {
  const { error } = await admin
    .from('campaigns')
    .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId);
  if (error) throw new Error(error.message);
}

export async function executePreparePlan(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  question: string;
  intent: OperatorIntent;
  leads: LeadSearchHit[];
  campaignId?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<WriteResult[]> {
  const env = args.env ?? process.env;
  const results: WriteResult[] = [];
  const verb = args.intent.writeVerb;

  if (verb === 'analyze') {
    const lead = args.leads[0];
    if (!lead) {
      return [{ tool: 'analyze_business', ok: false, summary: 'Nessun lead nel contesto.', data: {} }];
    }
    const analyzed = await analyzeLeadWebsite({
      admin: args.admin,
      workspaceId: args.workspaceId,
      leadId: lead.id,
      env,
    });
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'analyze_business',
      action: 'analyze',
      entityType: 'lead',
      entityId: lead.id,
      result: { opportunity: analyzed.opportunity.aiOpportunityScore },
    });
    results.push({
      tool: 'analyze_business',
      ok: true,
      summary: `Analisi ${lead.name}: opportunità ${analyzed.opportunity.aiOpportunityScore}.`,
      data: {
        leadId: lead.id,
        analysis: analyzed.analysis,
        opportunity: analyzed.opportunity,
      },
    });
    return results;
  }

  if (verb === 'pause') {
    if (!args.campaignId) {
      return [
        {
          tool: 'pause_campaign',
          ok: false,
          summary: 'Quale campagna vuoi mettere in pausa? Aprila o indica il nome.',
          data: { needsCampaign: true },
        },
      ];
    }
    const { data: campaign } = await args.admin
      .from('campaigns')
      .select('id, name, status')
      .eq('workspace_id', args.workspaceId)
      .eq('id', args.campaignId)
      .maybeSingle();
    if (!campaign) {
      return [
        {
          tool: 'pause_campaign',
          ok: false,
          summary: 'Campagna non trovata.',
          data: { campaignId: args.campaignId },
        },
      ];
    }
    return [
      await createPausePending({
        admin: args.admin,
        workspaceId: args.workspaceId,
        campaignId: args.campaignId,
        campaign: { name: campaign.name, status: campaign.status },
      }),
    ];
  }

  if (verb === 'resume') {
    if (!args.campaignId) {
      return [
        {
          tool: 'resume_campaign',
          ok: false,
          summary: 'Quale campagna vuoi riprendere? Aprila o indica il nome.',
          data: { needsCampaign: true },
        },
      ];
    }
    await resumeCampaign(args.admin, args.workspaceId, args.campaignId);
    await recordAiAudit(args.admin, {
      workspaceId: args.workspaceId,
      actor: 'AI',
      tool: 'resume_campaign',
      action: 'resume',
      entityType: 'campaign',
      entityId: args.campaignId,
    });
    return [
      {
        tool: 'resume_campaign',
        ok: true,
        summary: 'Campagna ripresa.',
        data: { campaignId: args.campaignId },
      },
    ];
  }

  const selected = dedupeLeads(args.leads).slice(0, args.intent.limit);
  if (selected.length === 0) {
    return [
      {
        tool: 'create_campaign',
        ok: false,
        summary: 'Non ho trovato lead adatti con i filtri richiesti.',
        data: {},
      },
    ];
  }

  const deliveryMode = args.intent.deliveryMode ?? 'TEST';
  const allowlist = parseTestRecipientAllowlist(env);
  if (deliveryMode === 'TEST' && allowlist.length === 0) {
    return [
      {
        tool: 'create_campaign',
        ok: false,
        summary: 'Manca RESEND_TEST_RECIPIENT_ALLOWLIST: non posso creare una campagna TEST.',
        data: { blocker: 'TEST_ALLOWLIST_MISSING' },
      },
    ];
  }

  const city = args.intent.city ?? 'selezione';
  const name = `${deliveryMode} · ${city} · ${selected.length} attività`;
  const created = await createCampaignWithLeads(args.admin, args.workspaceId, {
    name,
    leadIds: selected.map((l) => l.id),
    deliveryMode,
    testRecipient: deliveryMode === 'TEST' ? allowlist[0] : null,
    mode: 'MANUAL',
  });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'create_campaign',
    action: 'create',
    entityType: 'campaign',
    entityId: created.campaignId,
    result: { leadCount: selected.length, deliveryMode },
  });
  results.push({
    tool: 'create_campaign',
    ok: true,
    summary: `Campagna creata con ${selected.length} lead. Nessun messaggio inviato.`,
    data: { campaignId: created.campaignId, leadCount: selected.length, deliveryMode, eligible: created.eligible, skipped: created.skipped },
  });

  const prepared = await enqueueCampaignPreparation(args.admin, args.workspaceId, created.campaignId);
  const queue = new SupabaseJobQueue(args.admin);
  for (const lead of selected.slice(0, 30)) {
    await queue.enqueue({
      workspaceId: args.workspaceId,
      jobType: 'WEBSITE_ANALYSIS',
      entityType: 'lead',
      entityId: lead.id,
      idempotencyKey: `WEBSITE_ANALYSIS:lead:${lead.id}:v1`,
      inputSnapshot: { leadId: lead.id, campaignId: created.campaignId },
      priority: 80,
    });
  }
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'prepare_campaign',
    action: 'prepare',
    entityType: 'campaign',
    entityId: created.campaignId,
    result: { enqueued: prepared.enqueued },
  });
  results.push({
    tool: 'prepare_campaign',
    ok: true,
    summary: `Preparazione avviata per ${prepared.enqueued} attività (enrichment, analisi, demo, copy). Zero invii.`,
    data: {
      campaignId: created.campaignId,
      enqueued: prepared.enqueued,
      selected: selected.length,
    },
  });
  return results;
}

export async function createSendPending(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  campaignId: string;
}): Promise<WriteResult> {
  const { data: campaign } = await args.admin
    .from('campaigns')
    .select('id, name, delivery_mode, status')
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.campaignId)
    .maybeSingle();
  if (!campaign) {
    return { tool: 'send_campaign', ok: false, summary: 'Campagna non trovata.', data: {} };
  }
  const { data: leads } = await args.admin
    .from('campaign_leads')
    .select('id, status, preparation')
    .eq('workspace_id', args.workspaceId)
    .eq('campaign_id', args.campaignId);
  const eligible =
    leads?.filter((row) => row.status === 'REVIEW' || row.status === 'READY' || row.status === 'APPROVED') ?? [];
  const blocked = leads?.filter((row) => row.status === 'SKIPPED' || row.status === 'FAILED') ?? [];
  const pending = await createPendingAction(args.admin, {
    workspaceId: args.workspaceId,
    tool: 'send_campaign',
    params: { campaignId: args.campaignId },
    targetSummary: {
      campaignId: args.campaignId,
      name: campaign.name,
      deliveryMode: campaign.delivery_mode,
      eligible: eligible.length,
      blocked: blocked.length,
    },
  });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'send_campaign',
    action: 'pending',
    entityType: 'campaign',
    entityId: args.campaignId,
    confirmationId: pending.id,
    result: { eligible: eligible.length, blocked: blocked.length },
  });
  return {
    tool: 'send_campaign',
    ok: true,
    summary: `${eligible.length} eleggibili, ${blocked.length} bloccati, ${campaign.delivery_mode}. Nessun invio finché non confermi.`,
    data: {
      pendingActionId: pending.id,
      campaignId: args.campaignId,
      eligible: eligible.length,
      blocked: blocked.length,
      deliveryMode: campaign.delivery_mode,
      name: campaign.name,
    },
  };
}

export async function createPausePending(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  campaignId: string;
  campaign: { name: string; status: string; leadCount?: number };
}): Promise<WriteResult> {
  const pending = await createPendingAction(args.admin, {
    workspaceId: args.workspaceId,
    tool: 'pause_campaign',
    params: { campaignId: args.campaignId },
    targetSummary: {
      campaignId: args.campaignId,
      name: args.campaign.name,
      status: args.campaign.status,
      leadCount: args.campaign.leadCount ?? 0,
    },
  });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'pause_campaign',
    action: 'pending',
    entityType: 'campaign',
    entityId: args.campaignId,
    confirmationId: pending.id,
  });
  return {
    tool: 'pause_campaign',
    ok: true,
    summary: `Conferma per mettere in pausa «${args.campaign.name}».`,
    data: {
      pendingActionId: pending.id,
      campaignId: args.campaignId,
      name: args.campaign.name,
    },
  };
}

export async function executeCampaignMutation(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  verb: 'cancel' | 'hard_delete';
  campaignId: string | null;
  campaign: CampaignDetail | null;
}): Promise<WriteResult[]> {
  if (!args.campaignId || !args.campaign) {
    return [
      {
        tool: 'campaign_mutation',
        ok: false,
        summary: 'Quale campagna vuoi fermare o eliminare? Indicami il nome oppure aprila.',
        data: { needsCampaign: true, canHardDelete: CAMPAIGN_MUTATION_CAPABILITIES.hardDelete },
      },
    ];
  }

  const shortId = args.campaignId.slice(0, 8);
  const leadCount = Number(args.campaign.totals?.leads ?? 0);
  const facts = `«${args.campaign.name}» (${shortId}…), ${leadCount} lead, stato ${args.campaign.status}.`;

  if (args.verb === 'hard_delete' && !CAMPAIGN_MUTATION_CAPABILITIES.hardDelete) {
    const pause = CAMPAIGN_MUTATION_CAPABILITIES.pause
      ? await createPausePending({
          admin: args.admin,
          workspaceId: args.workspaceId,
          campaignId: args.campaignId,
          campaign: { name: args.campaign.name, status: args.campaign.status, leadCount },
        })
      : null;
    return [
      {
        tool: 'campaign_mutation',
        ok: true,
        summary: `Le campagne non vengono eliminate definitivamente dal sistema. ${facts} Posso metterla in pausa.`,
        data: {
          campaignId: args.campaignId,
          name: args.campaign.name,
          status: args.campaign.status,
          leadCount,
          shortId,
          hardDelete: false,
          choice: false,
          canPause: CAMPAIGN_MUTATION_CAPABILITIES.pause,
          pendingActionId: pause?.data.pendingActionId,
        },
      },
    ];
  }

  const pause = CAMPAIGN_MUTATION_CAPABILITIES.pause
    ? await createPausePending({
        admin: args.admin,
        workspaceId: args.workspaceId,
        campaignId: args.campaignId,
        campaign: { name: args.campaign.name, status: args.campaign.status, leadCount },
      })
    : null;

  return [
    {
      tool: 'campaign_mutation',
      ok: true,
      summary: `Vuoi fermare «${args.campaign.name}» oppure eliminarla definitivamente? ${facts} Metterla in pausa ferma gli invii. Nessuna modifica finché non confermi.`,
      data: {
        campaignId: args.campaignId,
        name: args.campaign.name,
        status: args.campaign.status,
        leadCount,
        shortId,
        hardDelete: false,
        choice: true,
        canPause: CAMPAIGN_MUTATION_CAPABILITIES.pause,
        pendingActionId: pause?.data.pendingActionId,
      },
    },
  ];
}

function dedupeLeads(leads: LeadSearchHit[]): LeadSearchHit[] {
  const seen = new Set<string>();
  const out: LeadSearchHit[] = [];
  for (const lead of leads) {
    const key = lead.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}
