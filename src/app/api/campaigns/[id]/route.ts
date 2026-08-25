import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { enqueueCampaignPreparation } from '@/lib/campaigns/prepare';
import { resumeCampaign } from '@/lib/campaigns/resume';
import { approveCampaignLeads } from '@/lib/campaigns/review-queue';
import { buildFollowupDraft } from '@/lib/messaging/visual-email';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import {
  isValidEmailShape,
  normalizeEmailAddress,
} from '@/lib/campaigns/test-delivery';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

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
  if (body.action === 'send_followup') {
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
      campaignLead.status !== 'SENT' ||
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

    await buildFollowupDraft(
      admin,
      workspace.id,
      campaignLead.id,
      campaignLead.sequence_step,
      process.env,
    );
    await admin
      .from('campaign_leads')
      .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
      .eq('id', campaignLead.id);
    const queue = new SupabaseJobQueue(admin);
    const queued = await queue.enqueue({
      workspaceId: workspace.id,
      jobType: 'SEND_MESSAGE',
      entityType: 'campaign_lead',
      entityId: campaignLead.id,
      idempotencyKey: `SEND_MESSAGE:campaign_lead:${campaignLead.id}:step:${campaignLead.sequence_step}`,
      inputSnapshot: { sequenceStep: campaignLead.sequence_step, manualFollowup: true },
      priority: 80,
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      deduplicated: queued.deduplicated,
      sequenceStep: campaignLead.sequence_step,
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
