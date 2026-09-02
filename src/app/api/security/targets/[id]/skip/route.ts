import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const POST = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await ((ctx as { params: Promise<{ id: string }> }).params);
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const { data, error } = await admin
    .from('security_targets')
    .update({ status: 'skipped', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspace.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Contatto non trovato.' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
