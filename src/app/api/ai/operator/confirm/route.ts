import { withAdmin } from '@/lib/api/with-admin';
import { confirmPendingAction } from '@/lib/ai/operator/confirm';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as { pendingActionId?: unknown; accept?: unknown };
  const pendingActionId = typeof body.pendingActionId === 'string' ? body.pendingActionId : '';
  if (!pendingActionId) return Response.json({ error: 'Azione mancante' }, { status: 400 });
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const result = await confirmPendingAction({
    admin,
    workspaceId: workspace.id,
    pendingActionId,
    accept: body.accept !== false,
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
});
