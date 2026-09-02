import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type {
  Json,
  SecurityConsentChannel,
  SecurityDeepAuditRow,
  SecurityTargetRow,
} from '@/lib/types/database';
import { deepAnalysisFromRow, runAuthorizedDeepScan, type DeepAnalysis } from './deep-scan';
import { analysisFromAudit, hasUsableAuditAnalysis } from './run-audit';
import { normalizeDomain } from '@/lib/leads/normalize';

export async function openDeepCheck(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    targetId: string;
    channel: SecurityConsentChannel;
    note?: string | null;
  },
): Promise<SecurityTargetRow> {
  const { data: target, error: readError } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.targetId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!target) throw new Error('Contatto non trovato.');

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('security_targets')
    .update({
      status: 'deep_open',
      consent_channel: input.channel,
      consent_note: input.note?.trim() || null,
      consent_at: now,
      updated_at: now,
    })
    .eq('id', input.targetId)
    .eq('workspace_id', input.workspaceId)
    .select('*')
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? 'Non ho potuto aprire il controllo approfondito.');
  }
  return updated;
}

export async function saveDeepCheck(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    targetId: string;
    notes?: string | null;
    done?: boolean;
  },
): Promise<SecurityTargetRow> {
  const now = new Date().toISOString();
  const patch = {
    deep_notes: input.notes ?? null,
    updated_at: now,
  };

  const { data: updated, error } = await admin
    .from('security_targets')
    .update(patch)
    .eq('id', input.targetId)
    .eq('workspace_id', input.workspaceId)
    .select('*')
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? 'Salvataggio non riuscito.');
  }
  return updated;
}

function asJson(value: unknown): Json {
  return value as Json;
}

export async function runDeepCheck(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    targetId: string;
  },
): Promise<{ audit: SecurityDeepAuditRow; analysis: DeepAnalysis }> {
  const { data: target, error: targetError } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.targetId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error('Contatto non trovato.');
  if (!target.consent_at || !target.consent_channel) {
    throw new Error('Manca il consenso registrato per il controllo approfondito.');
  }
  if (!target.latest_audit_id) {
    throw new Error('Prima di approfondire serve il primo report della homepage.');
  }

  const { data: baseline, error: baselineError } = await admin
    .from('security_audits')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('id', target.latest_audit_id)
    .maybeSingle();
  if (baselineError) throw new Error(baselineError.message);
  if (!baseline) throw new Error('Il primo report non è più disponibile.');
  if (
    normalizeDomain(baseline.requested_url) !== normalizeDomain(target.url)
  ) {
    throw new Error(
      'Il sito è cambiato dopo il consenso: rileggi la homepage e registra un nuovo consenso.',
    );
  }
  const baselineAnalysis = analysisFromAudit(baseline);
  if (!hasUsableAuditAnalysis(baseline)) {
    throw new Error(
      'Il primo controllo non è riuscito: rileggi la homepage prima di avviare l’approfondimento.',
    );
  }

  const startedAt = new Date().toISOString();
  const { data: running, error: insertError } = await admin
    .from('security_deep_audits')
    .insert({
      workspace_id: input.workspaceId,
      target_id: target.id,
      lead_id: target.lead_id,
      baseline_audit_id: baseline.id,
      consent_channel: target.consent_channel,
      consent_at: target.consent_at,
      requested_url: target.url,
      status: 'running',
      started_at: startedAt,
    })
    .select('*')
    .single();
  if (insertError || !running) {
    throw new Error(insertError?.message ?? 'Non ho potuto avviare il secondo report.');
  }

  await admin
    .from('security_targets')
    .update({ status: 'deep_running', updated_at: startedAt })
    .eq('workspace_id', input.workspaceId)
    .eq('id', target.id);

  try {
    const analysis = await runAuthorizedDeepScan({
      targetUrl: target.url,
      baselineFindings: baselineAnalysis.findings,
    });
    analysis.metadata.baselineScore = baseline.score;
    analysis.metadata.baselineAuditId = baseline.id;
    const completedAt = new Date().toISOString();
    const { data: completed, error: completeError } = await admin
      .from('security_deep_audits')
      .update({
        status: 'completed',
        final_url: analysis.finalUrl,
        score: analysis.score,
        pages_scanned: asJson(analysis.pages),
        findings: asJson(analysis.findings),
        comparison: asJson(analysis.comparison),
        metadata: asJson(analysis.metadata),
        completed_at: completedAt,
        error: null,
      })
      .eq('id', running.id)
      .select('*')
      .single();
    if (completeError || !completed) {
      throw new Error(completeError?.message ?? 'Non ho potuto salvare il secondo report.');
    }
    const { error: updateTargetError } = await admin
      .from('security_targets')
      .update({
        status: 'deep_done',
        latest_deep_audit_id: completed.id,
        updated_at: completedAt,
      })
      .eq('workspace_id', input.workspaceId)
      .eq('id', target.id);
    if (updateTargetError) throw new Error(updateTargetError.message);
    return { audit: completed, analysis };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'La scansione approfondita non è riuscita.';
    const completedAt = new Date().toISOString();
    await admin
      .from('security_deep_audits')
      .update({ status: 'failed', error: message, completed_at: completedAt })
      .eq('id', running.id);
    await admin
      .from('security_targets')
      .update({
        status: 'deep_failed',
        latest_deep_audit_id: running.id,
        updated_at: completedAt,
      })
      .eq('workspace_id', input.workspaceId)
      .eq('id', target.id);
    throw new Error(message);
  }
}

export async function loadLatestDeepCheck(
  admin: AppSupabaseClient,
  target: SecurityTargetRow,
): Promise<{ audit: SecurityDeepAuditRow; analysis: DeepAnalysis | null } | null> {
  if (!target.latest_deep_audit_id) return null;
  const { data, error } = await admin
    .from('security_deep_audits')
    .select('*')
    .eq('workspace_id', target.workspace_id)
    .eq('id', target.latest_deep_audit_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { audit: data, analysis: deepAnalysisFromRow(data) };
}
