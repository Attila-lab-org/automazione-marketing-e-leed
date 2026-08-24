import { resolveAppUrl } from '@/lib/app-url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDemoById } from '@/lib/demos/load';
import { isOwnerWhatsAppConfigured } from '@/lib/templates/owner-commercial';

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

/** Intro HTML v2 — CTA chiari, WhatsApp opzionale. Firma studio (non il destinatario). */
export const VISUAL_INTRO_BODY_V2 = `<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#2c241e">Buongiorno,</p>
<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#2c241e">abbiamo preparato un'anteprima personalizzata per <strong>{{business_name}}</strong>.</p>
{{preview_image_block}}
<div style="margin:28px 0 8px">{{cta_block}}</div>
{{whatsapp_block}}
<p style="margin:28px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;color:#7a6f65">Concept dimostrativo — non è ancora il sito definitivo.</p>
<p style="margin:22px 0 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#2c241e">Cordiali saluti,<br/>{{sender_name}}</p>`;

function buildCtaBlock(demoUrl: string): string {
  return `<a href="${demoUrl}" style="display:inline-block;padding:14px 22px;background:#1c1917;color:#fffdf9;text-decoration:none;border-radius:999px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600">Vedi l'anteprima completa</a>`;
}

function buildWhatsAppBlock(whatsappUrl: string | null): string {
  if (!whatsappUrl) return '';
  return `<div style="margin:12px 0 0"><a href="${whatsappUrl}" style="display:inline-block;padding:14px 22px;background:#128C7E;color:#ffffff;text-decoration:none;border-radius:999px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600">Scrivimi su WhatsApp</a></div>
<p style="margin:10px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#5c534c">Preferisci scrivere in privato? Tocca il pulsante sopra.</p>`;
}

function isLegacyPlainIntro(body: string): boolean {
  return (
    body.includes('Anteprima / concept') ||
    (!body.includes('<p') && body.includes('{{preview_image_block}}'))
  );
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

  const appUrl = resolveAppUrl(env);
  const demoUrl = `${appUrl}${demo.publicPath}`;
  const previewImageUrl = `${appUrl}${demo.publicPath}/email-preview?v=3`;
  // Preferisci il nome branding della demo (locale), non un contatto test
  const brandingName =
    (demo.data as { branding?: { business_name?: string | null } })?.branding?.business_name?.trim() ||
    '';
  const businessName = brandingName || lead?.name || 'la tua attività';
  const senderName = 'Sales Automation OS';
  const whatsappEnabled = isOwnerWhatsAppConfigured(env);
  const whatsappUrl = whatsappEnabled
    ? `${appUrl}${demo.publicPath}/interesse?channel=whatsapp`
    : null;

  const previewImageBlock = `<a href="${demoUrl}" style="display:block;text-decoration:none"><img src="${previewImageUrl}" alt="Anteprima ${businessName}" width="600" height="360" style="display:block;max-width:100%;width:100%;height:auto;border:0;border-radius:12px" /></a>`;
  const ctaBlock = buildCtaBlock(demoUrl);
  const whatsappBlock = buildWhatsAppBlock(whatsappUrl);

  const vars: Record<string, string> = {
    business_name: businessName,
    demo_url: demoUrl,
    preview_image_url: previewImageUrl,
    preview_image_block: previewImageBlock,
    cta_block: ctaBlock,
    whatsapp_block: whatsappBlock,
    sender_name: senderName,
    city: lead?.city ?? '',
  };

  const subjectTpl =
    templateVersion?.subject ?? "{{business_name}} — abbiamo preparato un'anteprima per te";
  const rawBody = templateVersion?.body ?? VISUAL_INTRO_BODY_V2;
  const bodyTpl = isLegacyPlainIntro(rawBody) ? VISUAL_INTRO_BODY_V2 : rawBody;

  const subject = resolveTemplate(subjectTpl, vars);
  let body = resolveTemplate(bodyTpl, vars);
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
  const appUrl = resolveAppUrl(env);
  const demoUrl = demo ? `${appUrl}${demo.publicPath}` : appUrl;
  const brandingName =
    (demo?.data as { branding?: { business_name?: string | null } } | undefined)?.branding
      ?.business_name?.trim() || '';
  const businessName = brandingName || lead?.name || 'la tua attività';
  const senderName = 'Sales Automation OS';
  const whatsappUrl =
    demo && isOwnerWhatsAppConfigured(env)
      ? `${appUrl}${demo.publicPath}/interesse?channel=whatsapp`
      : null;
  const waHtml = whatsappUrl
    ? `<p style="margin:16px 0"><a href="${whatsappUrl}" style="display:inline-block;padding:12px 20px;background:#128C7E;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Scrivimi su WhatsApp</a></p>`
    : '';

  const templates: Record<number, { subject: string; body: string }> = {
    1: {
      subject: `${businessName} — un breve follow-up`,
      body: `<p>Buongiorno,</p><p>riprendo brevemente riguardo all'anteprima preparata per <strong>${businessName}</strong>.</p><p><a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Vedi l'anteprima</a></p>${waHtml}<p>Cordiali saluti,<br/>${senderName}</p>`,
    },
    2: {
      subject: `${businessName} — ultimo messaggio`,
      body: `<p>Buongiorno,</p><p>questo è l'ultimo follow-up riguardo all'anteprima per <strong>${businessName}</strong>.</p><p><a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Vedi l'anteprima</a></p>${waHtml}<p>Se non è di interesse, non riceverete altri messaggi automatici.</p><p>Cordiali saluti,<br/>${senderName}</p>`,
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
    resolved: { business_name: businessName, demo_url: demoUrl, sender_name: senderName },
  });

  return { draftId: draft.id, subject: draft.subject, demoUrl };
}
