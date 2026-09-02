import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { importLeadsAsTargets, listSecurityTargets } from '@/lib/security/run-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

function configured() {
  return isSupabaseConfigured(process.env) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const GET = withAdmin(async () => {
  if (!configured()) {
    return NextResponse.json({ error: 'Supabase non configurato', targets: [] }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const targets = await listSecurityTargets(admin, workspace.id);
  return NextResponse.json({ targets });
});

export const POST = withAdmin(async (request: Request) => {
  if (!configured()) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { leadIds?: unknown } | null;
  const leadIds = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((id): id is string => typeof id === 'string').slice(0, 50)
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: 'Seleziona almeno un contatto.' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const result = await importLeadsAsTargets(admin, workspace.id, leadIds);
  const targets = await listSecurityTargets(admin, workspace.id);
  return NextResponse.json({
    imported: result.imported,
    skippedNoSite: result.skippedNoSite,
    message:
      result.skippedNoSite > 0
        ? `${result.imported} siti in lista. ${result.skippedNoSite} senza sito, saltati.`
        : `${result.imported} siti in lista.`,
    targets,
  });
});
