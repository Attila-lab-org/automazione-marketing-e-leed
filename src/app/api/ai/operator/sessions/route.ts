import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listOperatorMessages } from '@/lib/ai/operator/sessions';
import { parseOperatorActions } from '@/lib/ai/operator/actions';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ messages: [] });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const messages = await listOperatorMessages(admin, workspace.id, sessionId);
  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      actions: parseOperatorActions(m.actions),
    })),
  });
});
