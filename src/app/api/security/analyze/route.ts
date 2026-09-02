import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { ANALYZE_MAX_BATCH, analyzeLeadIds } from '@/lib/security/run-audit';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { leadIds?: unknown } | null;
  const leadIds = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: 'Seleziona almeno un contatto con sito.' }, { status: 400 });
  }
  if (leadIds.length > ANALYZE_MAX_BATCH) {
    return NextResponse.json(
      { error: `Al massimo ${ANALYZE_MAX_BATCH} siti per volta.` },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const result = await analyzeLeadIds(admin, workspace.id, leadIds);
  return NextResponse.json({
    analyzed: result.analyzed,
    failed: result.failed,
    skippedNoSite: result.skippedNoSite,
    results: result.results,
    message: [
      result.analyzed ? `${result.analyzed} report pronti` : null,
      result.failed ? `${result.failed} pagine non raggiunte` : null,
      result.skippedNoSite ? `${result.skippedNoSite} senza sito` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Nessun sito da aprire.',
  });
});
