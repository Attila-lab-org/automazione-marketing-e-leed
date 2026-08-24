import type { AppSupabaseClient } from '@/lib/types/supabase-database';

export type ManualLeadInput = {
  businessName: string;
  email: string;
  websiteUrl?: string | null;
  phone?: string | null;
  city?: string | null;
  category?: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

/**
 * Manual lead into the same leads table / pipeline (source = MANUAL).
 * Fails closed if contact/source provenance insert fails.
 */
export async function createManualLead(
  admin: AppSupabaseClient,
  workspaceId: string,
  input: ManualLeadInput,
) {
  const name = input.businessName?.trim();
  const email = input.email?.trim();
  if (!name) throw new Error('business_name obbligatorio');
  if (!email || !email.includes('@')) throw new Error('email obbligatoria e valida');

  const normalizedEmail = normalizeEmail(email);
  const website = input.websiteUrl?.trim() || null;
  const phone = input.phone?.trim() || null;
  const city = input.city?.trim() || null;
  const category = input.category?.trim() || 'restaurant';

  const { data: existing, error: existingError } = await admin
    .from('leads')
    .select('id, name, email')
    .eq('workspace_id', workspaceId)
    .eq('normalized_email', normalizedEmail)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Lead manuale: dedupe fallita — ${existingError.message}`);
  }
  if (existing) {
    throw new Error(`Lead con email ${normalizedEmail} già presente (id ${existing.id})`);
  }

  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      workspace_id: workspaceId,
      name,
      email,
      normalized_email: normalizedEmail,
      website_url: website,
      normalized_domain: normalizeDomain(website),
      phone,
      normalized_phone: normalizePhone(phone),
      city,
      category,
      business_status: 'NEW',
      processing_status: 'IDLE',
      current_score: 50,
      current_confidence: 40,
    })
    .select('id, name, email, website_url, phone, city, category, business_status, created_at')
    .single();

  if (error || !lead) {
    throw new Error(`Lead manuale: ${error?.message ?? 'inserimento fallito'}`);
  }

  const { error: contactError } = await admin.from('lead_contacts').insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    type: 'EMAIL',
    value: email,
    normalized_value: normalizedEmail,
    label: 'manual',
    is_primary: true,
    source: 'MANUAL',
  });
  if (contactError) {
    await admin.from('leads').delete().eq('id', lead.id);
    throw new Error(`Lead manuale: lead_contacts fallito — ${contactError.message}`);
  }

  const { error: sourceError } = await admin.from('lead_sources').insert({
    workspace_id: workspaceId,
    lead_id: lead.id,
    source_type: 'MANUAL',
    query_snapshot: {
      business_name: name,
      email: normalizedEmail,
      website_url: website,
      phone,
      city,
      category,
    },
  });
  if (sourceError) {
    await admin.from('lead_contacts').delete().eq('lead_id', lead.id);
    await admin.from('leads').delete().eq('id', lead.id);
    throw new Error(`Lead manuale: lead_sources fallito — ${sourceError.message}`);
  }

  return lead;
}
