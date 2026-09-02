import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { loadSecurityReport } from '@/lib/security/run-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await ((ctx as { params: Promise<{ id: string }> }).params);
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const report = await loadSecurityReport(admin, workspace.id, id);
  if (!report) {
    return NextResponse.json({ error: 'Report non trovato.' }, { status: 404 });
  }
  return NextResponse.json(report);
});
