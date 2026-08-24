import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDemoById } from '@/lib/demos/load';

function resolveTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

async function upsertDraft(
  admin: SupabaseClient,
  workspaceId: string,
  args: {
    campaignLeadId: string;
    leadId: string;
    templateVersionId: string;
    sequenceStep: number;
    subject: string;
    body: string;
    resolved: Record<string, string>;
  },
) {
  const { data: existing } = await admin
    .from('message_drafts')
    .select('id')
    .eq('campaign_lead_id', args.campaignLeadId)
    .eq('sequence_step', args.sequenceStep)
    .maybeSingle();

  const row = {
    workspace_id: workspaceId,
    campaign_lead_id: args.campaignLeadId,
    lead_id: args.leadId,
    template_version_id: args.templateVersionId,
    sequence_step: args.sequenceStep,
    subject: args.subject,
    body: args.body,
    resolved_variables: args.resolved,
    status: 'READY' as const,
  };

  const { data: draft, error } = existing?.id
    ? await admin.from('message_drafts').update(row).eq('id', existing.id).select('id, subject').single()
    : await admin.from('message_drafts').insert(row).select('id, subject').single();

  if (error || !draft) throw new Error(`Draft: salvataggio fallito — ${error?.message ?? ''}`);
  return draft;
}

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

  const [{ data: lead }, { data: campaign }] = await Promise.all([
    admin.from('leads').select('id, name, email, city').eq('id', cl.lead_id).single(),
    admin.from('campaigns').select('message_template_version_id').eq('id', cl.campaign_id).single(),
  ]);

  if (!cl.demo_site_id) throw new Error('Draft: demo non pronta');
  if (!campaign?.message_template_version_id) {
    throw new Error('Draft: message template version mancante sulla campagna');
  }

  const demo = await loadDemoById(admin, workspaceId, cl.demo_site_id);
  if (!demo) throw new Error('Draft: demo illeggibile');

  const { data: templateVersion } = await admin
    .from('message_template_versions')
    .select('id, subject, body')
    .eq('id', campaign.message_template_version_id)
    .single();

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const demoUrl = `${appUrl}${demo.publicPath}`;
  const previewImageUrl = `${appUrl}${demo.publicPath}/email-preview`;
  const businessName = lead?.name ?? 'la tua attività';
  const previewImageBlock = `<a href="${demoUrl}"><img src="${previewImageUrl}" alt="Anteprima ${businessName}" width="600" style="max-width:100%;border-radius:12px" /></a>`;
  const ctaBlock = `<a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px">Vedi l'anteprima completa</a>`;

  const vars: Record<string, string> = {
    business_name: businessName,
    demo_url: demoUrl,
    preview_image_url: previewImageUrl,
    preview_image_block: previewImageBlock,
    cta_block: ctaBlock,
    sender_name: 'Sales Automation OS',
    city: lead?.city ?? '',
  };

  const subjectTpl =
    templateVersion?.subject ?? "{{business_name}} — abbiamo preparato un'anteprima per te";
  const bodyTpl =
    templateVersion?.body ??
    `Buongiorno,\n\nabbiamo preparato un'anteprima personalizzata per {{business_name}}.\n\n{{preview_image_block}}\n\n{{cta_block}}\n\nAnteprima / concept dimostrativo.\n\nCordiali saluti,\n{{sender_name}}`;

  const subject = resolveTemplate(subjectTpl, vars);
  let body = resolveTemplate(bodyTpl, vars);
  // Convert newlines to paragraphs if plain text template
  if (!body.includes('<')) {
    body = body
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }

  const draft = await upsertDraft(admin, workspaceId, {
    campaignLeadId,
    leadId: cl.lead_id,
    templateVersionId: campaign.message_template_version_id,
    sequenceStep: 0,
    subject,
    body,
    resolved: vars,
  });

  return { draftId: draft.id, subject: draft.subject, demoUrl, previewImageUrl };
}

export async function buildFollowupDraft(
  admin: SupabaseClient,
  workspaceId: string,
  campaignLeadId: string,
  sequenceStep: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  const { data: cl, error } = await admin
    .from('campaign_leads')
    .select('id, lead_id, demo_site_id, campaign_id')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId)
    .single();
  if (error || !cl) throw new Error(`Followup draft: campaign_lead non trovato`);

  const [{ data: lead }, { data: campaign }] = await Promise.all([
    admin.from('leads').select('name').eq('id', cl.lead_id).single(),
    admin
      .from('campaigns')
      .select('message_template_version_id, followup_sequence_version_id')
      .eq('id', cl.campaign_id)
      .single(),
  ]);

  const demo = cl.demo_site_id ? await loadDemoById(admin, workspaceId, cl.demo_site_id) : null;
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const demoUrl = demo ? `${appUrl}${demo.publicPath}` : appUrl;
  const businessName = lead?.name ?? 'la tua attività';

  const templates: Record<number, { subject: string; body: string }> = {
    1: {
      subject: `${businessName} — un breve follow-up`,
      body: `<p>Buongiorno,</p><p>riprendo brevemente riguardo all'anteprima preparata per <strong>${businessName}</strong>.</p><p>Se può esservi utile, la trovate qui: <a href="${demoUrl}">${demoUrl}</a></p><p>Cordiali saluti,<br/>Sales Automation OS</p>`,
    },
    2: {
      subject: `${businessName} — ultimo messaggio`,
      body: `<p>Buongiorno,</p><p>questo è l'ultimo follow-up riguardo all'anteprima per <strong>${businessName}</strong>.</p><p><a href="${demoUrl}">Vedi l'anteprima</a></p><p>Se non è di interesse, non riceverete altri messaggi automatici.</p><p>Cordiali saluti,<br/>Sales Automation OS</p>`,
    },
  };

  const tpl = templates[sequenceStep] ?? templates[1]!;
  if (!campaign?.message_template_version_id) {
    throw new Error('Followup draft: template version mancante');
  }

  const draft = await upsertDraft(admin, workspaceId, {
    campaignLeadId,
    leadId: cl.lead_id,
    templateVersionId: campaign.message_template_version_id,
    sequenceStep,
    subject: tpl.subject,
    body: tpl.body,
    resolved: { business_name: businessName, demo_url: demoUrl },
  });

  return { draftId: draft.id, subject: draft.subject, demoUrl };
}
