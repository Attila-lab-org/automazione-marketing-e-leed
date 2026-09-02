import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type {
  Json,
  LeadRow,
  SecurityAuditRow,
  SecurityTargetRow,
  SecurityTargetStatus,
} from '@/lib/types/database';
import { normalizeDomain } from '@/lib/leads/normalize';
import { mapPool } from './concurrency';
import { buildScopeLetter, buildSecurityEmail } from './copy';
import { fetchPublicHomepage, newPublicSlug, PageFetchError } from './fetch-page';
import {
  analyzeSurfacePage,
  type SurfaceAnalysis,
  type SurfaceFinding,
} from './surface-audit';
import { UrlNotAllowedError } from './url-guard';
import type { SecurityTargetListItem } from './labels';

export type { SecurityTargetListItem } from './labels';

export const ANALYZE_MAX_BATCH = 20;
export const ANALYZE_CONCURRENCY = 5;

export type SecurityReport = {
  target: SecurityTargetRow;
  lead: Pick<LeadRow, 'id' | 'name' | 'email' | 'website_url' | 'city' | 'phone'>;
  audit: SecurityAuditRow | null;
  analysis: SurfaceAnalysis | null;
  emailPreview: { subject: string; html: string; text: string } | null;
  letter: string;
  canSendEmail: boolean;
};

function asJson(value: unknown): Json {
  return value as Json;
}

export function parseFindings(raw: Json): SurfaceFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.code !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.detail !== 'string' ||
      typeof row.evidence !== 'string'
    ) {
      return [];
    }
    const severity =
      row.severity === 'HIGH' || row.severity === 'MEDIUM' || row.severity === 'LOW'
        ? row.severity
        : 'LOW';
    return [
      {
        code: row.code,
        severity,
        title: row.title,
        detail: row.detail,
        evidence: row.evidence,
      },
    ];
  });
}

export function analysisFromAudit(audit: SecurityAuditRow): SurfaceAnalysis {
  const headers = (audit.headers && typeof audit.headers === 'object' && !Array.isArray(audit.headers)
    ? audit.headers
    : {}) as SurfaceAnalysis['headers'];
  return {
    score: audit.score,
    headers: {
      https: Boolean(headers.https),
      hsts: typeof headers.hsts === 'boolean' ? headers.hsts : headers.hsts === null ? null : null,
      csp:
        headers.csp === 'present' || headers.csp === 'report-only' || headers.csp === 'missing'
          ? headers.csp
          : 'missing',
      frameProtection: Boolean(headers.frameProtection),
      nosniff: Boolean(headers.nosniff),
    },
    technologies: Array.isArray(audit.technologies)
      ? audit.technologies.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const row = item as Record<string, unknown>;
          if (typeof row.name !== 'string' || typeof row.evidence !== 'string') return [];
          return [{ name: row.name, evidence: row.evidence }];
        })
      : [],
    findings: parseFindings(audit.findings),
    emailsFound: Array.isArray(audit.emails_found)
      ? audit.emails_found.filter((item): item is string => typeof item === 'string')
      : [],
    apiMentions: Array.isArray(audit.api_mentions)
      ? audit.api_mentions.filter((item): item is string => typeof item === 'string')
      : [],
    gaIds: Array.isArray(audit.ga_ids)
      ? audit.ga_ids.filter((item): item is string => typeof item === 'string')
      : [],
    payment: 'none',
  };
}

export async function ensureTargetForLead(
  admin: AppSupabaseClient,
  workspaceId: string,
  lead: Pick<LeadRow, 'id' | 'name' | 'website_url' | 'normalized_domain'>,
): Promise<{ target: SecurityTargetRow; skippedReason?: string }> {
  const url = lead.website_url?.trim();
  if (!url) {
    throw new Error('Questo contatto non ha un sito da aprire.');
  }
  const domain = lead.normalized_domain || normalizeDomain(url) || 'sito';

  const { data: existing, error: existingError } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', lead.id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Sicurezza: lettura lista fallita — ${existingError.message}`);
  }
  if (existing) {
    const { data: updated, error: updateError } = await admin
      .from('security_targets')
      .update({
        url,
        domain,
        name: lead.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updateError || !updated) {
      throw new Error(`Sicurezza: aggiornamento lista fallito — ${updateError?.message ?? 'sconosciuto'}`);
    }
    return { target: updated };
  }

  const { data: created, error: insertError } = await admin
    .from('security_targets')
    .insert({
      workspace_id: workspaceId,
      lead_id: lead.id,
      url,
      domain,
      name: lead.name,
      status: 'listed',
      public_slug: newPublicSlug(),
    })
    .select('*')
    .single();
  if (insertError || !created) {
    throw new Error(`Sicurezza: inserimento lista fallito — ${insertError?.message ?? 'sconosciuto'}`);
  }
  return { target: created };
}

export async function importLeadsAsTargets(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadIds: string[],
): Promise<{ imported: number; skippedNoSite: number; targets: SecurityTargetRow[] }> {
  if (leadIds.length === 0) return { imported: 0, skippedNoSite: 0, targets: [] };

  const { data: leads, error } = await admin
    .from('leads')
    .select('id, name, website_url, normalized_domain')
    .eq('workspace_id', workspaceId)
    .in('id', leadIds);
  if (error) throw new Error(`Sicurezza: lettura contatti fallita — ${error.message}`);

  let skippedNoSite = 0;
  const targets: SecurityTargetRow[] = [];
  for (const lead of leads ?? []) {
    if (!lead.website_url?.trim()) {
      skippedNoSite += 1;
      continue;
    }
    const { target } = await ensureTargetForLead(admin, workspaceId, lead);
    targets.push(target);
  }
  return { imported: targets.length, skippedNoSite, targets };
}

async function persistAudit(
  admin: AppSupabaseClient,
  input: {
    workspaceId: string;
    target: SecurityTargetRow;
    requestedUrl: string;
    analysis: SurfaceAnalysis | null;
    page?: { finalUrl: string; httpStatus: number };
    error?: string;
  },
): Promise<SecurityAuditRow> {
  const analysis = input.analysis;
  const score = analysis?.score ?? 0;
  const { data: audit, error } = await admin
    .from('security_audits')
    .insert({
      workspace_id: input.workspaceId,
      target_id: input.target.id,
      lead_id: input.target.lead_id,
      requested_url: input.requestedUrl,
      final_url: input.page?.finalUrl ?? null,
      http_status: input.page?.httpStatus ?? null,
      score,
      headers: asJson(analysis?.headers ?? {}),
      technologies: asJson(analysis?.technologies ?? []),
      findings: asJson(analysis?.findings ?? []),
      emails_found: asJson(analysis?.emailsFound ?? []),
      api_mentions: asJson(analysis?.apiMentions ?? []),
      ga_ids: asJson(analysis?.gaIds ?? []),
      error: input.error ?? null,
    })
    .select('*')
    .single();
  if (error || !audit) {
    throw new Error(`Sicurezza: salvataggio controllo fallito — ${error?.message ?? 'sconosciuto'}`);
  }

  const status: SecurityTargetStatus = analysis ? 'audited' : 'failed';
  const { error: updateError } = await admin
    .from('security_targets')
    .update({
      status,
      score,
      latest_audit_id: audit.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.target.id);
  if (updateError) {
    throw new Error(`Sicurezza: aggiornamento contatto fallito — ${updateError.message}`);
  }
  return audit;
}

export async function runSurfaceAudit(
  admin: AppSupabaseClient,
  workspaceId: string,
  target: SecurityTargetRow,
): Promise<{ targetId: string; ok: boolean; score: number | null; error?: string }> {
  try {
    const page = await fetchPublicHomepage(target.url);
    const analysis = analyzeSurfacePage({
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      httpStatus: page.httpStatus,
      headers: page.headers,
      html: page.html,
    });
    const audit = await persistAudit(admin, {
      workspaceId,
      target,
      requestedUrl: page.requestedUrl,
      analysis,
      page,
    });
    return { targetId: target.id, ok: true, score: audit.score };
  } catch (err) {
    const message =
      err instanceof PageFetchError || err instanceof UrlNotAllowedError
        ? err.message
        : 'Non sono riuscito ad aprire la pagina pubblica.';
    const certFailed = err instanceof PageFetchError && err.code === 'CERT';
    const analysis: SurfaceAnalysis | null = certFailed
      ? {
          score: 75,
          headers: {
            https: true,
            hsts: null,
            csp: 'missing',
            frameProtection: false,
            nosniff: false,
          },
          technologies: [],
          findings: [
            {
              code: 'BAD_CERT',
              severity: 'HIGH',
              title: 'Il lucchetto della pagina non è accettato',
              detail:
                'Aprendo la pagina pubblica, il certificato non è valido. Non è una prova di furti già avvenuti.',
              evidence: message,
            },
          ],
          emailsFound: [],
          apiMentions: [],
          gaIds: [],
          payment: 'none',
        }
      : null;
    await persistAudit(admin, {
      workspaceId,
      target,
      requestedUrl: target.url,
      analysis,
      error: message,
    });
    return { targetId: target.id, ok: false, score: analysis?.score ?? 0, error: message };
  }
}

export async function analyzeLeadIds(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadIds: string[],
): Promise<{
  analyzed: number;
  failed: number;
  skippedNoSite: number;
  results: Array<{ targetId: string; leadId: string; ok: boolean; score: number | null; error?: string }>;
}> {
  const uniqueIds = [...new Set(leadIds)].slice(0, ANALYZE_MAX_BATCH);
  const imported = await importLeadsAsTargets(admin, workspaceId, uniqueIds);
  const results = await mapPool(imported.targets, ANALYZE_CONCURRENCY, async (target) => {
    const outcome = await runSurfaceAudit(admin, workspaceId, target);
    return { ...outcome, leadId: target.lead_id };
  });
  return {
    analyzed: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    skippedNoSite: imported.skippedNoSite,
    results,
  };
}

export async function listSecurityTargets(
  admin: AppSupabaseClient,
  workspaceId: string,
): Promise<SecurityTargetListItem[]> {
  const { data: targets, error } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Sicurezza: lettura lista fallita — ${error.message}`);
  if (!targets?.length) return [];

  const leadIds = targets.map((row) => row.lead_id);
  const auditIds = targets.map((row) => row.latest_audit_id).filter((id): id is string => Boolean(id));

  const [{ data: leads }, { data: audits }] = await Promise.all([
    admin.from('leads').select('id, email, city').eq('workspace_id', workspaceId).in('id', leadIds),
    auditIds.length
      ? admin.from('security_audits').select('id, created_at, findings').in('id', auditIds)
      : Promise.resolve({ data: [] as Array<{ id: string; created_at: string; findings: Json }> }),
  ]);

  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  const auditById = new Map((audits ?? []).map((audit) => [audit.id, audit]));

  return targets.map((target) => {
    const lead = leadById.get(target.lead_id);
    const audit = target.latest_audit_id ? auditById.get(target.latest_audit_id) : undefined;
    return {
      id: target.id,
      leadId: target.lead_id,
      name: target.name,
      url: target.url,
      domain: target.domain,
      status: target.status,
      score: target.score,
      publicSlug: target.public_slug,
      email: lead?.email ?? null,
      city: lead?.city ?? null,
      updatedAt: target.updated_at,
      latestAuditAt: audit?.created_at ?? null,
      findingsCount: Array.isArray(audit?.findings) ? audit.findings.length : 0,
    };
  });
}

export async function loadSecurityReport(
  admin: AppSupabaseClient,
  workspaceId: string,
  targetId: string,
): Promise<SecurityReport | null> {
  const { data: target, error } = await admin
    .from('security_targets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw new Error(`Sicurezza: lettura report fallita — ${error.message}`);
  if (!target) return null;

  const { data: lead } = await admin
    .from('leads')
    .select('id, name, email, website_url, city, phone')
    .eq('id', target.lead_id)
    .maybeSingle();
  if (!lead) return null;

  let audit: SecurityAuditRow | null = null;
  if (target.latest_audit_id) {
    const { data } = await admin
      .from('security_audits')
      .select('*')
      .eq('id', target.latest_audit_id)
      .maybeSingle();
    audit = data ?? null;
  }

  const analysis = audit && !audit.error ? analysisFromAudit(audit) : audit ? analysisFromAudit(audit) : null;
  const emailPreview = analysis
    ? buildSecurityEmail({ businessName: target.name, domain: target.domain, analysis })
    : null;

  return {
    target,
    lead,
    audit,
    analysis,
    emailPreview,
    letter: buildScopeLetter({ businessName: target.name, domain: target.domain }),
    canSendEmail: Boolean(lead.email?.includes('@')),
  };
}

export async function loadPublicSecurityReport(
  admin: AppSupabaseClient,
  slug: string,
): Promise<{
  name: string;
  domain: string;
  score: number;
  findings: SurfaceFinding[];
} | null> {
  const { data: target, error } = await admin
    .from('security_targets')
    .select('*')
    .eq('public_slug', slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target || target.score === null || !target.latest_audit_id) return null;

  const { data: audit } = await admin
    .from('security_audits')
    .select('*')
    .eq('id', target.latest_audit_id)
    .maybeSingle();
  if (!audit) return null;
  const analysis = analysisFromAudit(audit);
  return {
    name: target.name,
    domain: target.domain,
    score: target.score,
    findings: analysis.findings.slice(0, 3).map((item) => ({
      ...item,
      evidence: item.code === 'EMAILS_VISIBLE' ? 'In pagina è visibile un indirizzo email' : item.evidence,
      detail: item.detail,
    })),
  };
}
