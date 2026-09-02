import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import { normalizeDomain } from '@/lib/leads/normalize';
import { assertPublicHttpUrl, parsePublicHttpUrl } from './url-guard';
import { ensureTargetForLead, runSurfaceAudit } from './run-audit';

export function homepageHref(raw: string): string {
  const url = parsePublicHttpUrl(raw);
  return `${url.protocol}//${url.host}/`;
}

export function displayNameForSite(name: string | null | undefined, host: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 120);
  return host.replace(/^www\./i, '').slice(0, 120);
}

export async function analyzeManualSite(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: { url: string; name?: string | null },
): Promise<{
  targetId: string;
  leadId: string;
  name: string;
  domain: string;
  ok: boolean;
  score: number | null;
  error?: string;
}> {
  const publicUrl = await assertPublicHttpUrl(input.url);
  const homepage = `${publicUrl.protocol}//${publicUrl.host}/`;
  const domain = normalizeDomain(homepage);
  if (!domain) {
    throw new Error('Indirizzo del sito non valido.');
  }
  const givenName = input.name?.trim() || null;
  const fallbackName = displayNameForSite(givenName, publicUrl.hostname);

  const { data: existingTargets, error: targetError } = await admin
    .from('security_targets')
    .select('id, lead_id, name')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (targetError) {
    throw new Error(`Sicurezza: lettura lista fallita — ${targetError.message}`);
  }

  let lead: { id: string; name: string; website_url: string | null; normalized_domain: string | null };

  if (existingTargets?.[0]) {
    const { data: byId, error } = await admin
      .from('leads')
      .select('id, name, website_url, normalized_domain')
      .eq('workspace_id', workspaceId)
      .eq('id', existingTargets[0].lead_id)
      .maybeSingle();
    if (error) throw new Error(`Sicurezza: lettura contatto fallita — ${error.message}`);
    if (byId) lead = byId;
    else lead = await createLeadForSite(admin, workspaceId, { name: fallbackName, homepage, domain });
  } else {
    const { data: byDomain, error } = await admin
      .from('leads')
      .select('id, name, website_url, normalized_domain')
      .eq('workspace_id', workspaceId)
      .eq('normalized_domain', domain)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Sicurezza: lettura contatto fallita — ${error.message}`);
    lead = byDomain?.[0]
      ? byDomain[0]
      : await createLeadForSite(admin, workspaceId, { name: fallbackName, homepage, domain });
  }

  const nextName = givenName ?? lead.name;
  if (lead.website_url !== homepage || lead.name !== nextName || lead.normalized_domain !== domain) {
    const { data: updated, error: updateError } = await admin
      .from('leads')
      .update({
        name: nextName,
        website_url: homepage,
        normalized_domain: domain,
      })
      .eq('id', lead.id)
      .select('id, name, website_url, normalized_domain')
      .single();
    if (updateError || !updated) {
      throw new Error(`Sicurezza: aggiornamento contatto fallito — ${updateError?.message ?? 'sconosciuto'}`);
    }
    lead = updated;
  }

  const { target } = await ensureTargetForLead(admin, workspaceId, {
    id: lead.id,
    name: lead.name,
    website_url: homepage,
    normalized_domain: domain,
  });
  const outcome = await runSurfaceAudit(admin, workspaceId, { ...target, url: homepage, name: lead.name, domain });
  return {
    targetId: outcome.targetId,
    leadId: lead.id,
    name: lead.name,
    domain,
    ok: outcome.ok,
    score: outcome.score,
    error: outcome.error,
  };
}

async function createLeadForSite(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: { name: string; homepage: string; domain: string },
): Promise<{ id: string; name: string; website_url: string | null; normalized_domain: string | null }> {
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      website_url: input.homepage,
      normalized_domain: input.domain,
      business_status: 'NEW',
      processing_status: 'IDLE',
    })
    .select('id, name, website_url, normalized_domain')
    .single();
  if (error || !lead) {
    throw new Error(`Sicurezza: creazione contatto fallita — ${error?.message ?? 'sconosciuto'}`);
  }

  const { error: sourceError } = await admin.from('lead_sources').insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    source_type: 'MANUAL',
    query_snapshot: {
      website_url: input.homepage,
      domain: input.domain,
      origin: 'security_manual',
    },
  });
  if (sourceError) {
    await admin.from('leads').delete().eq('id', lead.id);
    throw new Error(`Sicurezza: salvataggio origine fallito — ${sourceError.message}`);
  }
  return lead;
}
