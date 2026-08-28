import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { resumeCampaign } from '@/lib/campaigns/resume';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { buildFollowupDraft } from '@/lib/messaging/visual-email';
import {
  isValidEmailShape,
  normalizeEmailAddress,
} from '@/lib/campaigns/test-delivery';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { emailHtmlToText } from '@/lib/messaging/html-to-text';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  const { data: campaign, error } = await admin
    .from('campaigns')
    .select(
      'id, name, status, mode, delivery_mode, test_recipient, created_at, updated_at, rate_limit_per_hour, daily_send_limit',
    )
    .eq('workspace_id', workspace.id)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: 'Campagna non trovata' }, { status: 404 });

  const { data: leads, error: leadsError } = await admin
    .from('campaign_leads')
    .select('id, lead_id, status, sequence_step, next_action_at')
    .eq('workspace_id', workspace.id)
    .eq('campaign_id', id);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of leads ?? []) {
    const s = row.status ?? 'UNKNOWN';
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const leadIds = [...new Set((leads ?? []).map((row) => row.lead_id))];
  const [{ data: leadRows }, { data: inboundRows }] = await Promise.all([
    leadIds.length
      ? admin
          .from('leads')
          .select('id, name, email')
          .eq('workspace_id', workspace.id)
          .in('id', leadIds)
      : Promise.resolve({ data: [] }),
    leadIds.length
      ? admin
          .from('messages')
          .select('lead_id')
          .eq('workspace_id', workspace.id)
          .eq('direction', 'INBOUND')
          .in('lead_id', leadIds)
      : Promise.resolve({ data: [] }),
  ]);
  const leadById = new Map((leadRows ?? []).map((row) => [row.id, row]));
  const repliedLeadIds = new Set((inboundRows ?? []).map((row) => row.lead_id));
  const campaignLeadIds = (leads ?? []).map((row) => row.id);
  const { data: outboundRows } = campaignLeadIds.length
    ? await admin
        .from('messages')
        .select(
          'id, thread_id, lead_id, campaign_lead_id, provider, provider_message_id, to_address, subject, body_snapshot, sequence_step, sent_at, created_at',
        )
        .eq('workspace_id', workspace.id)
        .eq('direction', 'OUTBOUND')
        .in('campaign_lead_id', campaignLeadIds)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };
  const messageIds = (outboundRows ?? []).map((row) => row.id);
  const { data: eventRows } = messageIds.length
    ? await admin
        .from('message_events')
        .select('message_id, event_type, occurred_at')
        .eq('workspace_id', workspace.id)
        .in('message_id', messageIds)
        .order('occurred_at', { ascending: false })
    : { data: [] };
  const eventsByMessage = new Map<string, Array<{ event_type: string; occurred_at: string }>>();
  for (const event of eventRows ?? []) {
    const events = eventsByMessage.get(event.message_id) ?? [];
    events.push(event);
    eventsByMessage.set(event.message_id, events);
  }
  const sentMessages = (outboundRows ?? []).map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    campaignLeadId: message.campaign_lead_id,
    leadId: message.lead_id,
    leadName: leadById.get(message.lead_id)?.name ?? 'Attività',
    intendedRecipient: leadById.get(message.lead_id)?.email ?? null,
    actualRecipient: message.to_address,
    subject: message.subject,
    bodyText: emailHtmlToText(message.body_snapshot).slice(0, 5_000),
    sequenceStep: message.sequence_step,
    provider: message.provider,
    providerMessageId: message.provider_message_id,
    sentAt: message.sent_at ?? message.created_at,
    events: eventsByMessage.get(message.id) ?? [],
  }));
  const manualFollowups = (leads ?? [])
    .filter(
      (row) =>
        row.status === 'SENT' &&
        row.sequence_step > 0 &&
        Boolean(row.next_action_at) &&
        !repliedLeadIds.has(row.lead_id),
    )
    .map((row) => ({
      campaignLeadId: row.id,
      leadId: row.lead_id,
      leadName: leadById.get(row.lead_id)?.name ?? 'Attività',
      email: leadById.get(row.lead_id)?.email ?? null,
      sequenceStep: row.sequence_step,
      availableAt: row.next_action_at,
      due: new Date(row.next_action_at!).getTime() <= Date.now(),
    }))
    .sort((a, b) => String(a.availableAt).localeCompare(String(b.availableAt)));

  return NextResponse.json({
    campaign,
    counts,
    manualFollowups,
    sentMessages,
    totals: {
      leads: leads?.length ?? 0,
      review: counts.REVIEW ?? 0,
      ready: counts.READY ?? 0,
      approved: counts.APPROVED ?? 0,
      pending: counts.PENDING ?? 0,
      generating: counts.GENERATING ?? 0,
      sending: counts.SENDING ?? 0,
      failed: counts.FAILED ?? 0,
      skipped: counts.SKIPPED ?? 0,
      sent: counts.SENT ?? 0,
    },
  });
});

export const PATCH = withAdmin(async (request: Request, ctx?: unknown) => {
  const { id } = await (ctx as RouteCtx).params;
  const body = (await request.json()) as {
    action?: string;
    campaignLeadIds?: string[];
    deliveryMode?: 'PRODUCTION' | 'TEST';
    testRecipient?: string | null;
    campaignLeadId?: string;
  };
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  if (body.action === 'prepare') {
    const result = await enqueueCampaignPreparation(admin, workspace.id, id);
    return NextResponse.json(result);
  }
  if (body.action === 'approve') {
    const result = await approveCampaignLeads(admin, workspace.id, id, body.campaignLeadIds);
    return NextResponse.json(result);
  }
  if (body.action === 'send_followup' || body.action === 'prepare_followup') {
    if (!body.campaignLeadId) {
      return NextResponse.json({ error: 'campaignLeadId obbligatorio' }, { status: 400 });
    }
    const { data: campaignLead } = await admin
      .from('campaign_leads')
      .select('id, lead_id, status, sequence_step, next_action_at')
      .eq('workspace_id', workspace.id)
      .eq('campaign_id', id)
      .eq('id', body.campaignLeadId)
      .maybeSingle();
    if (!campaignLead) {
      return NextResponse.json({ error: 'Attività non trovata nella campagna' }, { status: 404 });
    }
    if (
      !['SENT', 'REVIEW'].includes(campaignLead.status) ||
      campaignLead.sequence_step < 1 ||
      !campaignLead.next_action_at
    ) {
      return NextResponse.json({ error: 'Follow-up non disponibile' }, { status: 409 });
    }
    if (new Date(campaignLead.next_action_at).getTime() > Date.now()) {
      return NextResponse.json(
        { error: 'Il follow-up non è ancora disponibile alla data prevista' },
        { status: 409 },
      );
    }
    const { count: replies } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .eq('lead_id', campaignLead.lead_id)
      .eq('direction', 'INBOUND');
    if ((replies ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Il cliente ha già risposto: continua dalla Posta in arrivo' },
        { status: 409 },
      );
    }

    try {
      await buildFollowupDraft(
        admin,
        workspace.id,
        campaignLead.id,
        campaignLead.sequence_step,
        process.env,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FOLLOWUP_BLOCKED_REPLY') {
        return NextResponse.json(
          { error: 'Il cliente ha già risposto: continua dalla Posta in arrivo' },
          { status: 409 },
        );
      }
      if (code === 'FOLLOWUP_BLOCKED_STOP') {
        return NextResponse.json(
          { error: 'Questo contatto ha chiesto di non essere ricontattato' },
          { status: 409 },
        );
      }
      if (code === 'FOLLOWUP_BLOCKED_HUMAN') {
        return NextResponse.json(
          { error: 'Conversazione già in gestione manuale: nessun follow-up automatico' },
          { status: 409 },
        );
      }
      throw err;
    }

    // Il primo clic prepara solo la bozza in Review: nessuna approvazione e nessun invio.
    await admin
      .from('campaign_leads')
      .update({ status: 'REVIEW', updated_at: new Date().toISOString() })
      .eq('id', campaignLead.id);

    await admin.from('activity_log').insert({
      workspace_id: workspace.id,
      actor_type: 'USER',
      entity_type: 'campaign_lead',
      entity_id: campaignLead.id,
      lead_id: campaignLead.lead_id,
      category: 'DECISION',
      event_type: 'FOLLOWUP_DRAFT_PREPARED',
      message: `Bozza follow-up ${campaignLead.sequence_step} pronta da approvare`,
      data: {
        campaignId: id,
        sequenceStep: campaignLead.sequence_step,
      },
    });

    return NextResponse.json({
      ok: true,
      prepared: true,
      queued: false,
      sequenceStep: campaignLead.sequence_step,
      href: '/review',
      message: 'Bozza personalizzata pronta nella coda di controllo. Approvala lì per inviare.',
    });
  }
  if (body.action === 'pause') {
    const { error } = await admin
      .from('campaigns')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'PAUSED' });
  }
  if (body.action === 'archive') {
    const { error } = await admin
      .from('campaigns')
      .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from('activity_log').insert({
      workspace_id: workspace.id,
      actor_type: 'USER',
      entity_type: 'campaign',
      entity_id: id,
      category: 'DECISION',
      event_type: 'CAMPAIGN_ARCHIVED',
      message: 'Campagna archiviata',
      data: {},
    });
    return NextResponse.json({ ok: true, status: 'ARCHIVED' });
  }
  if (body.action === 'delete') {
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, status')
      .eq('workspace_id', workspace.id)
      .eq('id', id)
      .maybeSingle();
    if (!campaign) return NextResponse.json({ error: 'Campagna non trovata' }, { status: 404 });
    if (campaign.status !== 'DRAFT' && campaign.status !== 'ARCHIVED') {
      return NextResponse.json(
        {
          error:
            'Puoi eliminare solo campagne in bozza o già archiviate. Prima mettile in archivio.',
        },
        { status: 409 },
      );
    }
    // Soft-delete: resta ARCHIVED e nascosta; niente hard delete per sicurezza.
    const { error } = await admin
      .from('campaigns')
      .update({
        status: 'ARCHIVED',
        name: `[eliminata] ${new Date().toISOString().slice(0, 10)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'ARCHIVED', deleted: true });
  }
  if (body.action === 'resume') {
    try {
      const result = await resumeCampaign(admin, workspace.id, id);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resume fallito';
      const status = message === 'Campagna non trovata' ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }
  if (body.action === 'update_delivery') {
    const deliveryMode = body.deliveryMode === 'TEST' ? 'TEST' : 'PRODUCTION';
    let testRecipient: string | null = null;
    if (deliveryMode === 'TEST') {
      const raw = body.testRecipient?.trim() ?? '';
      if (!raw || !isValidEmailShape(raw)) {
        return NextResponse.json(
          { error: 'Campagna TEST: email destinatario test obbligatoria' },
          { status: 400 },
        );
      }
      testRecipient = normalizeEmailAddress(raw);
    }
    const { error } = await admin
      .from('campaigns')
      .update({
        delivery_mode: deliveryMode,
        test_recipient: testRecipient,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deliveryMode, testRecipient });
  }
  return NextResponse.json({ error: 'action non supportata' }, { status: 400 });
});
