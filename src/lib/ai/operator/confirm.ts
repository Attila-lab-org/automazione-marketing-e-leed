import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { getPendingAction, hashPayload, markPending, claimPendingForExecution } from '@/lib/ai/operator/pending';
import { archiveCampaign, pauseCampaign, recordAiAudit } from '@/lib/ai/operator/writes';
import { activateAutonomyPolicy } from '@/lib/sales/autonomy';
import { executeOpsActionNow } from '@/lib/ai/operator/ops-writes';
import { getToolContract } from '@/lib/ai/operator/tool-contracts';

export async function confirmPendingAction(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  pendingActionId: string;
  accept: boolean;
}): Promise<{ ok: boolean; summary: string; result?: unknown }> {
  const row = await getPendingAction(args.admin, args.workspaceId, args.pendingActionId);
  if (!row) return { ok: false, summary: 'Azione non trovata' };
  if (row.status !== 'pending' && row.status !== 'confirmed') {
    return { ok: false, summary: `Azione già ${row.status}` };
  }
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
    return { ok: true, summary: 'Azione annullata. Nessuna modifica eseguita.' };
  }

  const claimed = await claimPendingForExecution(args.admin, args.workspaceId, row.id);
  if (!claimed) {
    // Recovery: già claimed ma non executed (retry dopo errore / doppio click)
    const again = await getPendingAction(args.admin, args.workspaceId, args.pendingActionId);
    if (again?.status === 'confirmed' && !again.executed_at) {
      // continua
    } else if (again?.status === 'executed') {
      return { ok: true, summary: 'Azione già eseguita.', result: again.result };
    } else {
      return { ok: false, summary: 'Azione già in esecuzione. Attendi un momento e riprova se non vedi l’esito.' };
    }
  }

  let result: unknown = {};
  let summary = 'Azione eseguita come confermata.';

  try {
    if (row.tool === 'send_campaign') {
      const campaignId = String(params.campaignId ?? '');
      result = await approveCampaignLeads(args.admin, args.workspaceId, campaignId);
    } else if (row.tool === 'enable_autonomy') {
      await activateAutonomyPolicy(args.admin, args.workspaceId, String(params.policyId ?? ''));
      result = { activated: true };
    } else if (row.tool === 'pause_campaign') {
      const campaignId = String(params.campaignId ?? '');
      await pauseCampaign(args.admin, args.workspaceId, campaignId);
      result = { paused: true, campaignId };
    } else if (row.tool === 'archive_campaign') {
      const campaignId = String(params.campaignId ?? '');
      const hide = params.hide === true;
      const archived = await archiveCampaign(args.admin, args.workspaceId, campaignId, hide);
      result = { archived: true, hidden: archived.hidden, campaignId };
      summary = archived.hidden
        ? `Ho nascosto «${archived.name}». I solleciti sono fermi. Le email già inviate restano nel registro.`
        : `Ho archiviato l’invio. I solleciti sono fermi. Lo trovi in Archivio.`;
    } else if (row.tool === 'delete_campaign') {
      return {
        ok: false,
        summary:
          'Non cancello le email già inviate. Posso archiviare o nascondere l’invio: dimmi «archivia questa campagna».',
      };
    } else if (
      row.tool === 'reply_telegram' ||
      row.tool === 'cancel_appointment' ||
      row.tool === 'stop_automation' ||
      row.tool === 'set_telegram_runtime'
    ) {
      const action =
        row.tool === 'set_telegram_runtime'
          ? String(params.runtimeAction ?? 'stop') === 'start'
            ? 'start_telegram'
            : 'stop_telegram'
          : row.tool;
      const executed = await executeOpsActionNow({
        admin: args.admin,
        workspaceId: args.workspaceId,
        action,
        params,
        refs: {
          lastThreadId: typeof params.threadId === 'string' ? params.threadId : null,
          lastLeadId: typeof params.leadId === 'string' ? params.leadId : null,
          lastEventId: typeof params.eventId === 'string' ? params.eventId : null,
        },
      });
      result = executed.data;
      summary = executed.summary;
      if (!executed.ok) {
        await markPending(args.admin, args.workspaceId, row.id, {
          status: 'pending',
          result: { failed: true, ...(executed.data as object) },
        });
        return { ok: false, summary: executed.summary, result };
      }
    } else {
      const contract = getToolContract(row.tool);
      if (!contract) {
        return { ok: false, summary: 'Tool non eseguibile dopo conferma' };
      }
      return { ok: false, summary: 'Tool non eseguibile dopo conferma' };
    }
  } catch (error) {
    await markPending(args.admin, args.workspaceId, row.id, {
      status: 'pending',
      result: { error: error instanceof Error ? error.message : 'errore' },
    });
    throw error;
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
  return { ok: true, summary, result };
}
