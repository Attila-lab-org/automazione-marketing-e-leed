import type { SupabaseClient } from '@supabase/supabase-js';
import { pickPublicEmail } from './email-from-website';

export async function persistLeadEmailIfMissing(
  admin: SupabaseClient,
  args: {
    workspaceId: string;
    leadId: string;
    emails: string[];
    siteDomain?: string | null;
    source?: string;
    label?: string;
  },
): Promise<{ saved: boolean; email: string | null; alreadyPresent: boolean }> {
  const picked = pickPublicEmail(args.emails, args.siteDomain);
  if (!picked) {
    return { saved: false, email: null, alreadyPresent: false };
  }

  const { data: lead } = await admin
    .from('leads')
    .select('id, email')
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return { saved: false, email: null, alreadyPresent: false };
  if (lead.email?.includes('@')) {
    return { saved: false, email: lead.email, alreadyPresent: true };
  }

  const { error: updateError } = await admin
    .from('leads')
    .update({
      email: picked,
      normalized_email: picked,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.leadId)
    .eq('workspace_id', args.workspaceId);
  if (updateError) {
    throw new Error(`Salvataggio email: ${updateError.message}`);
  }

  const { data: existingContact } = await admin
    .from('lead_contacts')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('lead_id', args.leadId)
    .eq('type', 'EMAIL')
    .eq('normalized_value', picked)
    .maybeSingle();
  if (!existingContact) {
    await admin.from('lead_contacts').insert({
      workspace_id: args.workspaceId,
      lead_id: args.leadId,
      type: 'EMAIL',
      value: picked,
      normalized_value: picked,
      label: args.label ?? 'sito pubblico',
      is_primary: true,
      source: args.source ?? 'WEBSITE_SCRAPE',
    });
  }

  return { saved: true, email: picked, alreadyPresent: false };
}
