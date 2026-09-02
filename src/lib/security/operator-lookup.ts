import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { explainFinding, plainFindingTitle } from './explain';
import { analysisFromAudit } from './run-audit';
import type { SecurityOperatorReport } from '@/lib/ai/operator/registry';

function sanitize(value: string): string {
  return value.trim().replace(/[%_]/g, '').slice(0, 80);
}

export async function lookupSecurityReport(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: { query?: string | null; targetId?: string | null },
): Promise<SecurityOperatorReport> {
  const targetId = input.targetId?.trim() || null;
  const query = input.query ? sanitize(input.query) : '';

  if (targetId) {
    return loadByTargetId(admin, workspaceId, targetId);
  }
  if (!query) {
    return { found: false, reason: 'Dimmi il nome dell’attività, oppure apri il report da Sicurezza.' };
  }

  const { data: targets, error } = await admin
    .from('security_targets')
    .select('id, name, score, status, latest_audit_id, domain, lead_id')
    .eq('workspace_id', workspaceId)
    .ilike('name', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(8);
  if (error) {
    return { found: false, reason: `Non ho potuto leggere i report: ${error.message}` };
  }

  if (!targets?.length) {
    return {
      found: false,
      reason: `Non ho un report Sicurezza per «${query}». Cercalo in Sicurezza e fai aprire la pagina pubblica.`,
    };
  }
  if (targets.length > 1) {
    const exact = targets.find((row) => row.name.toLowerCase() === query.toLowerCase());
    if (!exact) {
      return {
        found: false,
        reason: `Ho trovato ${targets.length} attività. Dimmi quale.`,
        alternatives: targets.map((row) => ({ targetId: row.id, name: row.name })),
      };
    }
    return loadByTargetId(admin, workspaceId, exact.id);
  }
  return loadByTargetId(admin, workspaceId, targets[0]!.id);
}

async function loadByTargetId(
  admin: AppSupabaseClient,
  workspaceId: string,
  targetId: string,
): Promise<SecurityOperatorReport> {
  const { data: target, error } = await admin
    .from('security_targets')
    .select('id, name, score, status, latest_audit_id, domain, lead_id')
    .eq('workspace_id', workspaceId)
    .eq('id', targetId)
    .maybeSingle();
  if (error) return { found: false, reason: error.message };
  if (!target) return { found: false, reason: 'Report non trovato.' };
  if (!target.latest_audit_id) {
    return {
      found: false,
      targetId: target.id,
      leadId: target.lead_id,
      name: target.name,
      domain: target.domain,
      score: target.score,
      status: target.status,
      reason: `Ho «${target.name}» in lista, ma manca ancora il controllo della pagina pubblica.`,
    };
  }

  const { data: audit } = await admin.from('security_audits').select('*').eq('id', target.latest_audit_id).maybeSingle();
  const { data: lead } = await admin
    .from('leads')
    .select('id, email')
    .eq('id', target.lead_id)
    .maybeSingle();
  const analysis = audit ? analysisFromAudit(audit) : null;
  const findings = (analysis?.findings ?? [])
    .slice()
    .sort((a, b) => {
      const rank = { problem: 0, protection: 1, info: 2 } as const;
      return rank[a.category] - rank[b.category];
    })
    .map((item) => {
      const explained = explainFinding(item.code);
      const risk =
        item.category === 'info'
          ? item.limit || explained.limit || 'Informazione pubblica: non abbassa il punteggio da sola.'
          : explained.risk;
      return {
        title: plainFindingTitle(item.code, item.title),
        meaning: explained.meaning,
        risk,
      };
    });

  return {
    found: Boolean(analysis),
    targetId: target.id,
    leadId: target.lead_id,
    name: target.name,
    domain: target.domain,
    score: target.score,
    status: target.status,
    email: lead?.email ?? null,
    findings,
    reason: analysis ? undefined : `Il controllo di «${target.name}» non è ancora pronto.`,
  };
}
