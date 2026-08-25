import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { stopLeadSequences } from '@/lib/sales/stop';
import { resumeTelegramAiAndReply } from '@/lib/inbound/telegram-resume';

export const runtime = 'nodejs';

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as {
    threadId?: string;
    action?: 'take_over' | 'return_to_ai' | 'stop';
  };
  if (!body.threadId || !body.action) {
    return NextResponse.json({ error: 'threadId e action obbligatori' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data: currentThread } = await admin
    .from('message_threads')
    .select('lead_id, channel')
    .eq('workspace_id', workspace.id)
    .eq('id', body.threadId)
    .maybeSingle();
  if (!currentThread) {
    return NextResponse.json({ error: 'Conversazione non trovata' }, { status: 404 });
  }
  if (body.action === 'take_over') {
    const { error } = await admin
      .from('message_threads')
      .update({
        assigned_mode: 'HUMAN',
        human_required_reason: 'Takeover umano attivo',
        status: 'NEEDS_REPLY',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (body.action === 'return_to_ai') {
    if (currentThread.channel === 'TELEGRAM') {
      const result = await resumeTelegramAiAndReply({
        admin,
        workspaceId: workspace.id,
        threadId: body.threadId,
      });
      const { data: updatedThread } = await admin
        .from('message_threads')
        .select('assigned_mode')
        .eq('id', body.threadId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        assignedMode: updatedThread?.assigned_mode,
        replied: result.sent,
        reason: result.reason,
      });
    }
    const { error } = await admin
      .from('message_threads')
      .update({
        assigned_mode: 'AI',
        human_required_reason: null,
        commercial_state: 'ENGAGED',
        status: 'OPEN',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (body.action === 'stop') {
    const { error } = await admin
      .from('message_threads')
      .update({
        commercial_state: 'NOT_INTERESTED',
        assigned_mode: 'HUMAN',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await stopLeadSequences(admin, workspace.id, currentThread.lead_id);
  }
  return NextResponse.json({ ok: true, assignedMode: body.action === 'take_over' ? 'HUMAN' : undefined });
});
