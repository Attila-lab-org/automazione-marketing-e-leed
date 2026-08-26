import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { emailHtmlToText } from '@/lib/messaging/html-to-text';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data: messages, error } = await admin
    .from('messages')
    .select(
      'id, thread_id, lead_id, campaign_lead_id, direction, provider, to_address, from_address, subject, body_snapshot, sent_at, created_at',
    )
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leadIds = [...new Set((messages ?? []).map((row) => row.lead_id))];
  const campaignLeadIds = [
    ...new Set((messages ?? []).map((row) => row.campaign_lead_id).filter(Boolean)),
  ] as string[];
  const messageIds = (messages ?? []).map((row) => row.id);
  const [{ data: leads }, { data: campaignLeads }, { data: events }] = await Promise.all([
    leadIds.length
      ? admin.from('leads').select('id, name, email').in('id', leadIds)
      : Promise.resolve({ data: [] }),
    campaignLeadIds.length
      ? admin
          .from('campaign_leads')
          .select('id, campaign_id')
          .in('id', campaignLeadIds)
      : Promise.resolve({ data: [] }),
    messageIds.length
      ? admin
          .from('message_events')
          .select('message_id, event_type, occurred_at')
          .in('message_id', messageIds)
          .order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const campaignIds = [
    ...new Set((campaignLeads ?? []).map((row) => row.campaign_id).filter(Boolean)),
  ] as string[];
  const { data: campaigns } = campaignIds.length
    ? await admin.from('campaigns').select('id, name, delivery_mode').in('id', campaignIds)
    : { data: [] };
  const leadById = new Map((leads ?? []).map((row) => [row.id, row]));
  const campaignLeadById = new Map((campaignLeads ?? []).map((row) => [row.id, row]));
  const campaignById = new Map((campaigns ?? []).map((row) => [row.id, row]));
  const latestEventByMessage = new Map<string, string>();
  for (const event of events ?? []) {
    if (!latestEventByMessage.has(event.message_id)) {
      latestEventByMessage.set(event.message_id, event.event_type);
    }
  }

  return NextResponse.json({
    communications: (messages ?? []).map((message) => {
      const campaignLead = message.campaign_lead_id
        ? campaignLeadById.get(message.campaign_lead_id)
        : null;
      const campaign = campaignLead?.campaign_id
        ? campaignById.get(campaignLead.campaign_id)
        : null;
      return {
        id: message.id,
        threadId: message.thread_id,
        direction: message.direction,
        channel: message.provider === 'telegram' ? 'TELEGRAM' : 'EMAIL',
        leadName: leadById.get(message.lead_id)?.name ?? 'Contatto',
        leadEmail: leadById.get(message.lead_id)?.email ?? null,
        address: message.direction === 'OUTBOUND' ? message.to_address : message.from_address,
        subject: message.subject,
        preview: emailHtmlToText(message.body_snapshot).slice(0, 220),
        occurredAt: message.sent_at ?? message.created_at,
        status:
          message.direction === 'OUTBOUND'
            ? latestEventByMessage.get(message.id) ?? 'SENT'
            : 'RECEIVED',
        campaign: campaign
          ? {
              id: campaign.id,
              name: campaign.name,
              deliveryMode: campaign.delivery_mode,
            }
          : null,
      };
    }),
  });
});
