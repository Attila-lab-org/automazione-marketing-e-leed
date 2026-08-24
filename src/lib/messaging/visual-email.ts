import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDemoById } from '@/lib/demos/load';

export async function buildVisualEmailDraft(
  admin: SupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const { data: cl, error } = await admin
    .from('campaign_leads')
    .select('id, lead_id, demo_site_id, sequence_step, campaign_id')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId)
    .single();

  if (error || !cl) throw new Error(`Draft: campaign_lead non trovato — ${error?.message ?? ''}`);

  const { data: lead } = await admin
    .from('leads')
    .select('id, name, email, city')
    .eq('id', cl.lead_id)
    .single();

  const { data: campaign } = await admin
    .from('campaigns')
    .select('message_template_version_id')
    .eq('id', cl.campaign_id)
    .single();

  if (!cl.demo_site_id) throw new Error('Draft: demo non pronta');

  const demo = await loadDemoById(admin, workspaceId, cl.demo_site_id);
  if (!demo) throw new Error('Draft: demo illeggibile');

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const demoUrl = `${appUrl}${demo.publicPath}`;
  const previewImageUrl = `${appUrl}${demo.publicPath}/email-preview`;
  const businessName = lead?.name ?? 'la tua attività';

  if (!campaign?.message_template_version_id) {
    throw new Error('Draft: message template version mancante sulla campagna');
  }

  const subject = `${businessName} — abbiamo preparato un'anteprima per te`;
  const html = `<p>Buongiorno,</p>
<p>abbiamo preparato un'anteprima personalizzata per <strong>${businessName}</strong>.</p>
<p><a href="${demoUrl}"><img src="${previewImageUrl}" alt="Anteprima ${businessName}" width="600" style="max-width:100%;border-radius:12px" /></a></p>
<p><a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px">Vedi l'anteprima completa</a></p>
<p><a href="${demoUrl}">${demoUrl}</a></p>
<p><em>Anteprima / concept dimostrativo</em></p>
<p>Cordiali saluti,<br/>Sales Automation OS</p>`;

  const { data: existing } = await admin
    .from('message_drafts')
    .select('id')
    .eq('campaign_lead_id', campaignLeadId)
    .eq('sequence_step', cl.sequence_step ?? 0)
    .maybeSingle();

  const row = {
    workspace_id: workspaceId,
    campaign_lead_id: campaignLeadId,
    lead_id: cl.lead_id,
    template_version_id: campaign.message_template_version_id,
    sequence_step: cl.sequence_step ?? 0,
    subject,
    body: html,
    resolved_variables: {
      business_name: businessName,
      demo_url: demoUrl,
      preview_image_url: previewImageUrl,
    },
    status: 'READY' as const,
  };

  const { data: draft, error: dError } = existing?.id
    ? await admin.from('message_drafts').update(row).eq('id', existing.id).select('id, subject').single()
    : await admin.from('message_drafts').insert(row).select('id, subject').single();

  if (dError || !draft) throw new Error(`Draft: salvataggio fallito — ${dError?.message ?? ''}`);
  return { draftId: draft.id, subject: draft.subject, demoUrl, previewImageUrl };
}
