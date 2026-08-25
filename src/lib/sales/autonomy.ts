import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { Json } from '@/lib/types/database';
import { createPendingAction } from '@/lib/ai/operator/pending';
import { recordAiAudit } from '@/lib/ai/operator/writes';
import type { WriteResult } from '@/lib/ai/operator/writes';

export function buildAutonomyProposal(question: string): {
  auto: string[];
  human: string[];
  summary: string;
} {
  const auto = ['saluti', 'richieste info', 'interesse', 'domande standard', 'qualificazione iniziale'];
  const human = ['prezzo', 'sconto', 'legale', 'reclami', 'richieste custom', 'confidence bassa'];
  if (/prezz/.test(question.toLowerCase()) && !human.includes('prezzo')) human.unshift('prezzo');
  return {
    auto,
    human,
    summary:
      'AUTO: saluti, info, interesse, FAQ, qualificazione iniziale. HUMAN: prezzo, sconto, legale, reclami, custom, bassa confidence.',
  };
}

export async function proposeAutonomyPolicy(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  question: string;
}): Promise<WriteResult> {
  const proposal = buildAutonomyProposal(args.question);
  const { data, error } = await args.admin
    .from('ai_autonomy_policies')
    .insert({
      workspace_id: args.workspaceId,
      name: 'Conversazioni semplici',
      status: 'proposed',
      proposal: proposal as unknown as Json,
      rules: {
        autoIntents: ['greeting', 'info_request', 'website_request'],
        humanIntents: ['quote_request', 'discount_request', 'legal_privacy', 'angry', 'custom_request'],
        minConfidence: 0.7,
      } as unknown as Json,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { tool: 'propose_autonomy', ok: false, summary: error?.message ?? 'Policy non creata', data: {} };
  }
  const pending = await createPendingAction(args.admin, {
    workspaceId: args.workspaceId,
    tool: 'enable_autonomy',
    params: { policyId: data.id },
    targetSummary: { ...proposal, policyId: data.id },
  });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'AI',
    tool: 'propose_autonomy',
    action: 'pending',
    entityType: 'autonomy_policy',
    entityId: data.id,
    confirmationId: pending.id,
  });
  return {
    tool: 'propose_autonomy',
    ok: true,
    summary: `Proposta autonomia. ${proposal.summary} Nessuna policy attiva finché non confermi.`,
    data: { pendingActionId: pending.id, policyId: data.id, ...proposal },
  };
}

export async function activateAutonomyPolicy(
  admin: AppSupabaseClient,
  workspaceId: string,
  policyId: string,
) {
  await admin
    .from('ai_autonomy_policies')
    .update({ status: 'disabled' })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');
  const { error } = await admin
    .from('ai_autonomy_policies')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', policyId);
  if (error) throw new Error(error.message);
}

export async function getActiveAutonomy(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<{ autoIntents: string[]; humanIntents: string[]; minConfidence: number } | null> {
  const { data } = await admin
    .from('ai_autonomy_policies')
    .select('rules')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.rules || typeof data.rules !== 'object') return null;
  const rules = data.rules as Record<string, unknown>;
  return {
    autoIntents: Array.isArray(rules.autoIntents) ? (rules.autoIntents as string[]) : [],
    humanIntents: Array.isArray(rules.humanIntents) ? (rules.humanIntents as string[]) : [],
    minConfidence: typeof rules.minConfidence === 'number' ? rules.minConfidence : 0.7,
  };
}
