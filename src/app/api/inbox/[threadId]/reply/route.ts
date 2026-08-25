import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { sendEmailConversationReply } from '@/lib/inbound/email-reply';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ threadId: string }> };

export const POST = withAdmin(async (request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const { threadId } = await (ctx as RouteCtx).params;
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim() ?? '';
  if (!text) return NextResponse.json({ error: 'Scrivi una risposta' }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ error: 'La risposta è troppo lunga' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data: thread } = await admin
    .from('message_threads')
    .select('id, lead_id, channel')
    .eq('workspace_id', workspace.id)
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: 'Conversazione non trovata' }, { status: 404 });
  if (thread.channel !== 'EMAIL') {
    return NextResponse.json(
      { error: 'Per Telegram usa il collegamento alla chat' },
      { status: 400 },
    );
  }

  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    admin
      .from('messages')
      .select('from_address, subject, provider_message_id')
      .eq('workspace_id', workspace.id)
      .eq('thread_id', threadId)
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('messages')
      .select('campaign_lead_id, provider_message_id')
      .eq('workspace_id', workspace.id)
      .eq('thread_id', threadId)
      .eq('direction', 'OUTBOUND')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!inbound?.from_address) {
    return NextResponse.json({ error: 'Destinatario della risposta non trovato' }, { status: 409 });
  }
  const email = inbound.from_address.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (!email) return NextResponse.json({ error: 'Email destinatario non valida' }, { status: 409 });

  const result = await sendEmailConversationReply({
    admin,
    workspaceId: workspace.id,
    threadId,
    leadId: thread.lead_id,
    campaignLeadId: outbound?.campaign_lead_id ?? null,
    recipient: email,
    subject: inbound.subject,
    text,
    inboundProviderEventId: `manual:${crypto.randomUUID()}`,
    previousProviderMessageId: outbound?.provider_message_id ?? null,
    approvedByHuman: true,
  });
  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
});
