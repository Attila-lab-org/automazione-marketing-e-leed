import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

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
  if (body.action === 'take_over') {
    await admin
      .from('message_threads')
      .update({ assigned_mode: 'HUMAN', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
  }
  if (body.action === 'return_to_ai') {
    await admin
      .from('message_threads')
      .update({
        assigned_mode: 'AI',
        human_required_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
  }
  if (body.action === 'stop') {
    await admin
      .from('message_threads')
      .update({
        commercial_state: 'NOT_INTERESTED',
        assigned_mode: 'HUMAN',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace.id)
      .eq('id', body.threadId);
  }
  return NextResponse.json({ ok: true });
});
