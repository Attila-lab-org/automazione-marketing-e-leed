import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { getPendingAction, hashPayload, markPending } from '@/lib/ai/operator/pending';
import { recordAiAudit } from '@/lib/ai/operator/writes';
import { activateAutonomyPolicy } from '@/lib/sales/autonomy';

export async function confirmPendingAction(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  pendingActionId: string;
  accept: boolean;
}): Promise<{ ok: boolean; summary: string; result?: unknown }> {
  const row = await getPendingAction(args.admin, args.workspaceId, args.pendingActionId);
  if (!row) return { ok: false, summary: 'Azione non trovata' };
  if (row.status !== 'pending') return { ok: false, summary: `Azione già ${row.status}` };
  if (new Date(row.expires_at) < new Date()) {
    await markPending(args.admin, args.workspaceId, row.id, { status: 'expired' });
    return { ok: false, summary: 'Conferma scaduta' };
  }

  const params = (row.params ?? {}) as Record<string, unknown>;
  const currentHash = hashPayload(row.tool, params);
  if (currentHash !== row.payload_hash) {
    return { ok: false, summary: 'Parametri non coincidono con l’azione salvata' };
  }

  if (!args.accept) {
    await markPending(args.admin, args.workspaceId, row.id, {
      status: 'cancelled',
      result: { cancelled: true },
    });
    return { ok: true, summary: 'Azione annullata. Nessun invio.' };
  }

  await markPending(args.admin, args.workspaceId, row.id, {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  });

  let result: unknown = {};
  if (row.tool === 'send_campaign') {
    const campaignId = String(params.campaignId ?? '');
    result = await approveCampaignLeads(args.admin, args.workspaceId, campaignId);
  } else if (row.tool === 'enable_autonomy') {
    await activateAutonomyPolicy(args.admin, args.workspaceId, String(params.policyId ?? ''));
    result = { activated: true };
  } else {
    return { ok: false, summary: 'Tool non eseguibile dopo conferma' };
  }

  await markPending(args.admin, args.workspaceId, row.id, {
    status: 'executed',
    executed_at: new Date().toISOString(),
    result: (result ?? {}) as import('@/lib/types/database').Json,
  });
  await recordAiAudit(args.admin, {
    workspaceId: args.workspaceId,
    actor: 'HUMAN',
    tool: row.tool,
    action: 'execute',
    confirmationId: row.id,
    result: result as Record<string, unknown>,
  });
  return { ok: true, summary: 'Azione eseguita come confermata.', result };
}
