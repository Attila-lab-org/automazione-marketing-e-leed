import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getInboxConversation } from '@/lib/inbound/conversation';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ threadId: string }> };

export const GET = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { threadId } = await (ctx as RouteCtx).params;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const conversation = await getInboxConversation(admin, workspace.id, threadId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversazione non trovata' }, { status: 404 });
  }
  return NextResponse.json({ conversation });
});
