import { resolveAppUrl } from '@/lib/app-url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDemoById } from '@/lib/demos/load';
import { isOwnerWhatsAppConfigured } from '@/lib/templates/owner-commercial';
import { EMAIL_PREVIEW_CACHE_VERSION } from '@/lib/messaging/constants';

function resolveTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
export const VISUAL_INTRO_BODY_V2 = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Georgia,serif">
<tr><td style="padding:0 0 16px;font-size:16px;line-height:1.55;color:#2c241e">Buongiorno,</td></tr>
<tr><td style="padding:0 0 12px;font-size:16px;line-height:1.55;color:#2c241e">ho preparato una proposta visiva per <strong>{{business_name}}</strong>{{city_phrase}}, partendo solo dalle informazioni pubbliche dell'attività.</td></tr>
{{personalized_insight_block}}
<tr><td style="padding:0">{{preview_image_block}}</td></tr>
<tr><td style="padding:24px 0 8px">{{cta_block}}</td></tr>
<tr><td style="padding:0">{{whatsapp_block}}</td></tr>
<tr><td style="padding:24px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;color:#6b625a">È solo una proposta dimostrativa, senza alcun impegno.</td></tr>
<tr><td style="padding:20px 0 0;font-size:15px;line-height:1.55;color:#2c241e">Cordiali saluti,<br/>{{sender_name}}</td></tr>
</table>`;

export function buildGroundedEmailInsight(analysis: unknown): string {
  const row =
    analysis && typeof analysis === 'object' && !Array.isArray(analysis)
      ? (analysis as Record<string, unknown>)
      : {};
  const listText = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const text = (item as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) return text.trim().replace(/[.;]+$/, '');
    }
    return null;
  };
  const strength = listText(row.strengths);
  const issue = listText(row.issues);
  if (!strength && !issue) return '';
  const facts = [strength, issue].filter((value): value is string => Boolean(value));
  const label = facts.length > 1 ? 'due segnali concreti' : 'un segnale concreto';
  return `Ho costruito l’anteprima attorno a ${label}: ${facts.join('; ')}.`;
}

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

  const [{ data: lead }, { data: campaign }, { data: analysis }] = await Promise.all([
    admin.from('leads').select('id, name, email, city').eq('id', cl.lead_id).single(),
    admin.from('campaigns').select('message_template_version_id').eq('id', cl.campaign_id).single(),
    admin
      .from('website_analyses')
      .select('strengths, issues')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', cl.lead_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const previewImageUrl = `${appUrl}${demo.publicPath}/email-preview?v=${EMAIL_PREVIEW_CACHE_VERSION}`;
  // Preferisci il nome branding della demo (locale), non un contatto test
  const brandingName =
    (demo.data as { branding?: { business_name?: string | null } })?.branding?.business_name?.trim() ||
    '';
  const businessName = brandingName || lead?.name || 'la tua attività';
  const senderName = env.OWNER_SENDER_NAME?.trim() || 'Attila Lab';
  const whatsappEnabled = isOwnerWhatsAppConfigured(env);
  const whatsappUrl = whatsappEnabled
    ? `${appUrl}${demo.publicPath}/interesse?channel=whatsapp`
    : null;

  // Table wrapper: Gmail non allarga/zoomma l'immagine oltre 600px
  const previewImageBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 0 8px 0"><tr><td style="padding:0"><a href="${demoUrl}" style="display:block;text-decoration:none;border:0;outline:none"><img src="${previewImageUrl}" alt="Anteprima ${escapeHtml(businessName)}" width="600" height="340" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:10px;outline:none" /></a></td></tr></table>`;
  const ctaBlock = buildCtaBlock(demoUrl);
  const whatsappBlock = buildWhatsAppBlock(whatsappUrl);
  const insight = buildGroundedEmailInsight(analysis);
  const personalizedInsightBlock = insight
    ? `<tr><td style="padding:0 0 20px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.55;color:#5c534c">${escapeHtml(insight)}</td></tr>`
    : '';

  const vars: Record<string, string> = {
    business_name: businessName,
    demo_url: demoUrl,
    preview_image_url: previewImageUrl,
    preview_image_block: previewImageBlock,
    cta_block: ctaBlock,
    whatsapp_block: whatsappBlock,
    personalized_insight_block: personalizedInsightBlock,
    sender_name: senderName,
    city: lead?.city ?? '',
    city_phrase: lead?.city?.trim() ? `, attività di ${lead.city.trim()}` : '',
  };

  const subjectTpl =
    templateVersion?.subject ?? "Una proposta visiva per {{business_name}}";
  const rawBody = templateVersion?.body ?? VISUAL_INTRO_BODY_V2;
  const bodyTpl = isLegacyPlainIntro(rawBody) ? VISUAL_INTRO_BODY_V2 : rawBody;

  const subject = resolveTemplate(subjectTpl, vars);
  let body = resolveTemplate(bodyTpl, {
    ...vars,
    business_name: escapeHtml(businessName),
    sender_name: escapeHtml(senderName),
    city: escapeHtml(lead?.city ?? ''),
    city_phrase: lead?.city?.trim()
      ? `, attività di ${escapeHtml(lead.city.trim())}`
      : '',
  });
  if (personalizedInsightBlock && !rawBody.includes('{{personalized_insight_block}}')) {
    body = body.replace(previewImageBlock, `${personalizedInsightBlock}${previewImageBlock}`);
  }
  if (!body.includes('<')) {
    body = body
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }
  if (/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(subject) || /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(body)) {
    throw new Error('Draft: il modello contiene variabili non riconosciute');
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
  if (!demo) throw new Error('Follow-up: anteprima non disponibile');
  const appUrl = resolveAppUrl(env);
  const demoUrl = demo ? `${appUrl}${demo.publicPath}` : appUrl;
  const brandingName =
    (demo?.data as { branding?: { business_name?: string | null } } | undefined)?.branding
      ?.business_name?.trim() || '';
  const businessName = brandingName || lead?.name || 'la tua attività';
  const senderName = env.OWNER_SENDER_NAME?.trim() || 'Attila Lab';
  const safeBusinessName = escapeHtml(businessName);
  const safeSenderName = escapeHtml(senderName);
  const whatsappUrl =
    demo && isOwnerWhatsAppConfigured(env)
      ? `${appUrl}${demo.publicPath}/interesse?channel=whatsapp`
      : null;
  const waHtml = whatsappUrl
    ? `<p style="margin:16px 0"><a href="${whatsappUrl}" style="display:inline-block;padding:12px 20px;background:#128C7E;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Scrivimi su WhatsApp</a></p>`
    : '';

  const templates: Record<number, { subject: string; body: string }> = {
    1: {
      subject: `${businessName} — hai visto la proposta?`,
      body: `<p>Ciao,</p><p>hai avuto modo di vedere la proposta preparata per <strong>${safeBusinessName}</strong>?</p><p><a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Rivedi la proposta</a></p>${waHtml}<p>Se ti va, dimmi cosa cambieresti per primo: ti rispondo con un’indicazione concreta.</p><p>A presto,<br/>${safeSenderName}</p>`,
    },
    2: {
      subject: `${businessName} — tengo aperta la proposta?`,
      body: `<p>Ciao,</p><p>ultimo messaggio sulla proposta dimostrativa per <strong>${safeBusinessName}</strong>.</p><p><a href="${demoUrl}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Rivedi la proposta</a></p>${waHtml}<p>Se vuoi approfondire, rispondi con “sì” e fissiamo una breve chiamata. Altrimenti non riceverai altri promemoria.</p><p>A presto,<br/>${safeSenderName}</p>`,
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
