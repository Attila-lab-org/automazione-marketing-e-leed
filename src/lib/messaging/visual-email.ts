import { resolveAppUrl } from '@/lib/app-url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDemoById } from '@/lib/demos/load';
import { appendEmailComplianceFooter } from '@/lib/suppression/email-compliance';
import {
  getOwnerDeliveryTime,
  getOwnerOfferPrice,
  getOwnerWhatsApp,
  isOwnerWhatsAppConfigured,
} from '@/lib/templates/owner-commercial';
import { extractContactPhone } from '@/lib/templates/v3-cta';
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

/** Email commerciale: valore, offerta e contatti leggibili anche su Gmail mobile. */
export const VISUAL_INTRO_BODY_V2 = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#292524">
<tr><td style="padding:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#a16207">Proposta riservata</td></tr>
<tr><td style="padding:0 0 14px;font-family:Georgia,serif;font-size:30px;line-height:1.15;color:#1c1917">Abbiamo immaginato il nuovo sito di {{business_name}}.</td></tr>
<tr><td style="padding:0 0 18px;font-size:16px;line-height:1.6;color:#57534e">Buongiorno, abbiamo preparato una proposta visiva per <strong>{{business_name}}</strong>{{city_phrase}}, usando soltanto le informazioni pubbliche dell'attività.</td></tr>
{{personalized_insight_block}}
<tr><td style="padding:0 0 20px">{{offer_block}}</td></tr>
<tr><td style="padding:0">{{preview_image_block}}</td></tr>
<tr><td style="padding:22px 0 8px">{{cta_block}}</td></tr>
<tr><td style="padding:0">{{whatsapp_block}}{{call_block}}</td></tr>
<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:#78716c">L'anteprima è gratuita e senza impegno. Prezzo e tempi si riferiscono alla proposta base; eventuali richieste aggiuntive vengono concordate prima.</td></tr>
<tr><td style="padding:20px 0 0;font-size:15px;line-height:1.55;color:#292524">A presto,<br/><strong>{{sender_name}}</strong></td></tr>
{{studio_block}}
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
  return `<a href="${demoUrl}" style="display:inline-block;padding:15px 24px;background:#1c1917;color:#ffffff;text-decoration:none;border-radius:10px;font-family:Arial,sans-serif;font-size:15px;font-weight:700">Guarda la proposta completa</a>`;
}

function buildOfferBlock(price: string, deliveryTime: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px"><tr><td style="padding:16px 18px"><span style="display:block;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#92400e">La proposta per te</span><strong style="display:block;margin-top:4px;font-family:Georgia,serif;font-size:22px;line-height:1.25;color:#1c1917">Il tuo sito da ${escapeHtml(price)}</strong><span style="display:block;margin-top:5px;font-size:14px;color:#57534e">Consegna in ${escapeHtml(deliveryTime)}</span></td></tr></table>`;
}

function buildWhatsAppBlock(whatsappUrl: string | null): string {
  if (!whatsappUrl) return '';
  return `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#44403c"><strong>Come contattarmi:</strong> un messaggio su WhatsApp o una chiamata. Ti rispondo io.</p><a href="${whatsappUrl}" style="display:inline-block;margin:0 8px 0 0;padding:13px 20px;background:#25d366;color:#062816;text-decoration:none;border-radius:999px;font-family:Arial,sans-serif;font-size:15px;font-weight:700">WhatsApp · scrivimi</a>`;
}

function buildCallBlock(callUrl: string | null): string {
  if (!callUrl) return '';
  return `<a href="${callUrl}" style="display:inline-block;margin:10px 0 0;padding:13px 18px;background:#ffffff;color:#1c1917;text-decoration:none;border:1px solid #d6d3d1;border-radius:10px;font-family:Arial,sans-serif;font-size:14px;font-weight:700">Chiamami</a>`;
}

export const STUDIO_SITE_URL = 'https://www.attila-lab.net/';

function buildStudioBlock(): string {
  return `<tr><td style="padding:18px 0 0;border-top:1px solid #e7e5e4"><p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#44403c"><strong>Chi siamo</strong><br/>Siamo Attila Lab. Per vedere chi siamo e come lavoriamo: <a href="${STUDIO_SITE_URL}" style="color:#1c1917;font-weight:700;text-decoration:underline">attila-lab.net</a></p></td></tr>`;
}

function buildStudioLine(): string {
  return `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#44403c"><strong>Chi siamo:</strong> Attila Lab · <a href="${STUDIO_SITE_URL}" style="color:#1c1917;font-weight:700">attila-lab.net</a></p>`;
}

function ensureStudioPresent(html: string): string {
  if (/attila-lab\.net/i.test(html)) return html;
  const block = buildStudioBlock();
  const close = html.lastIndexOf('</table>');
  if (close >= 0) return `${html.slice(0, close)}${block}${html.slice(close)}`;
  return `${html}${buildStudioLine()}`;
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
  const ownerPhone = extractContactPhone(env.OWNER_PHONE?.trim() || getOwnerWhatsApp(env));
  const callUrl = ownerPhone
    ? `${appUrl}${demo.publicPath}/interesse?channel=phone`
    : null;
  const offerPrice = getOwnerOfferPrice(env) ?? '350 €';
  const deliveryTime = getOwnerDeliveryTime(env);

  // Table wrapper: Gmail non allarga/zoomma l'immagine oltre 600px
  const previewImageBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 0 8px 0"><tr><td style="padding:0"><a href="${demoUrl}" style="display:block;text-decoration:none;border:0;outline:none"><img src="${previewImageUrl}" alt="Anteprima ${escapeHtml(businessName)}" width="600" height="340" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:10px;outline:none" /></a></td></tr></table>`;
  const ctaBlock = buildCtaBlock(demoUrl);
  const offerBlock = buildOfferBlock(offerPrice, deliveryTime);
  const whatsappBlock = buildWhatsAppBlock(whatsappUrl);
  const callBlock = buildCallBlock(callUrl);
  const insight = buildGroundedEmailInsight(analysis);
  const personalizedInsightBlock = insight
    ? `<tr><td style="padding:0 0 20px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.55;color:#5c534c">${escapeHtml(insight)}</td></tr>`
    : '';

  const studioBlock = buildStudioBlock();
  const vars: Record<string, string> = {
    business_name: businessName,
    demo_url: demoUrl,
    preview_image_url: previewImageUrl,
    preview_image_block: previewImageBlock,
    cta_block: ctaBlock,
    offer_block: offerBlock,
    whatsapp_block: whatsappBlock,
    call_block: callBlock,
    personalized_insight_block: personalizedInsightBlock,
    studio_block: studioBlock,
    sender_name: senderName,
    offer_price: offerPrice,
    delivery_time: deliveryTime,
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
  body = ensureStudioPresent(body);
  body = appendEmailComplianceFooter(body, workspaceId, cl.lead_id, env);
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
    .select('id, lead_id, demo_site_id, campaign_id, preparation')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignLeadId)
    .single();
  if (error || !cl) throw new Error(`Followup draft: campaign_lead non trovato`);

  const [{ data: lead }, { data: campaign }, { data: lastOutbound }, inboundRes] =
    await Promise.all([
      admin
        .from('leads')
        .select('name, category, city, business_status, email, normalized_email')
        .eq('id', cl.lead_id)
        .single(),
      admin
        .from('campaigns')
        .select('message_template_version_id, followup_sequence_version_id')
        .eq('id', cl.campaign_id)
        .single(),
      admin
        .from('messages')
        .select('subject, body_snapshot')
        .eq('campaign_lead_id', campaignLeadId)
        .eq('direction', 'OUTBOUND')
        .eq('sequence_step', 0)
        .order('sent_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('lead_id', cl.lead_id)
        .eq('direction', 'INBOUND'),
    ]);

  if ((inboundRes.count ?? 0) > 0) {
    throw new Error('FOLLOWUP_BLOCKED_REPLY');
  }

  if (lead?.business_status === 'SUPPRESSED') {
    throw new Error('FOLLOWUP_BLOCKED_STOP');
  }

  const normalizedEmail = lead?.normalized_email || lead?.email;
  if (normalizedEmail) {
    const { data: suppressed } = await admin
      .from('suppression_list')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('normalized_email', normalizedEmail.toLowerCase())
      .limit(1)
      .maybeSingle();
    if (suppressed) throw new Error('FOLLOWUP_BLOCKED_STOP');
  }

  const { data: humanThread } = await admin
    .from('message_threads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', cl.lead_id)
    .eq('assigned_mode', 'HUMAN')
    .limit(1)
    .maybeSingle();
  if (humanThread) throw new Error('FOLLOWUP_BLOCKED_HUMAN');

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
  const category = lead?.category?.trim() || null;
  const city = lead?.city?.trim() || null;
  const contextBits = [
    category ? `nel settore ${category}` : null,
    city ? `a ${city}` : null,
  ].filter(Boolean);
  const contextPhrase = contextBits.length ? ` ${contextBits.join(' ')}` : '';
  const whatsappUrl =
    demo && isOwnerWhatsAppConfigured(env)
      ? `${appUrl}${demo.publicPath}/interesse?channel=whatsapp`
      : null;
  const ownerPhone = extractContactPhone(env.OWNER_PHONE?.trim() || getOwnerWhatsApp(env));
  const callUrl =
    demo && ownerPhone ? `${appUrl}${demo.publicPath}/interesse?channel=phone` : null;
  const offerPrice = getOwnerOfferPrice(env) ?? '350 €';
  const deliveryTime = getOwnerDeliveryTime(env);
  const softContact = whatsappUrl
    ? `<p style="margin:16px 0 8px;font-size:15px;color:#44403c">Se ti va, puoi rispondermi qui o scrivermi su WhatsApp senza impegno.</p><a href="${whatsappUrl}" style="display:inline-block;margin:8px 8px 8px 0;padding:12px 18px;background:#25d366;color:#062816;text-decoration:none;border-radius:999px;font-weight:700">WhatsApp · scrivimi</a>`
    : callUrl
      ? `<p style="margin:16px 0 8px;font-size:15px;color:#44403c">Se preferisci, puoi anche chiamarmi quando ti è comodo.</p><a href="${callUrl}" style="display:inline-block;margin:8px 0;padding:12px 18px;border:1px solid #d6d3d1;color:#1c1917;text-decoration:none;border-radius:10px;font-weight:700">Chiamami</a>`
      : '';
  const offerLine = `La proposta base parte da <strong>${escapeHtml(offerPrice)}</strong>, con consegna in <strong>${escapeHtml(deliveryTime)}</strong>.`;
  const studioLine = buildStudioLine();
  const interestHint =
    typeof (cl.preparation as Record<string, unknown> | null)?.interestNote === 'string'
      ? String((cl.preparation as Record<string, unknown>).interestNote)
      : null;
  const personalNote = interestHint
    ? `<p>Mi era rimasto in mente questo punto: <em>${escapeHtml(interestHint)}</em>.</p>`
    : lastOutbound?.subject
      ? `<p>Ti avevo inviato la proposta «${escapeHtml(lastOutbound.subject)}»${contextPhrase}.</p>`
      : `<p>Ti avevo inviato una proposta dimostrativa per <strong>${safeBusinessName}</strong>${contextPhrase}.</p>`;

  const templates: Record<number, { subject: string; body: string }> = {
    1: {
      subject: `${businessName} — solo un pensiero sulla proposta`,
      body: `<p>Ciao,</p>${personalNote}<p>Nessuna fretta: volevo solo capire se l’anteprima ti è stata utile o se c’è qualcosa che cambieresti per primo.</p><p>${offerLine}</p><p><a href="${demoUrl}" style="display:inline-block;padding:13px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Rivedi la proposta</a></p>${softContact}${studioLine}<p>Se preferisci lasciar perdere, va benissimo: non ti sollecito oltre se non mi rispondi.</p><p>A presto,<br/>${safeSenderName}</p>`,
    },
    2: {
      subject: `${businessName} — chiudo qui, senza pressione`,
      body: `<p>Ciao,</p><p>ultimo messaggio soft sulla proposta per <strong>${safeBusinessName}</strong>${contextPhrase}.</p><p>${offerLine}</p><p><a href="${demoUrl}" style="display:inline-block;padding:13px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Rivedi la proposta</a></p>${softContact}${studioLine}<p>Se ti interessa approfondire, rispondi pure quando vuoi. Altrimenti non riceverai altri promemoria da questa sequenza.</p><p>A presto,<br/>${safeSenderName}</p>`,
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
    body: appendEmailComplianceFooter(tpl.body, workspaceId, cl.lead_id, env),
    resolved: {
      business_name: businessName,
      demo_url: demoUrl,
      sender_name: senderName,
      offer_price: offerPrice,
      delivery_time: deliveryTime,
      personalized: 'true',
      sequence_step: String(sequenceStep),
    },
  });

  return { draftId: draft.id, subject: draft.subject, demoUrl };
}
