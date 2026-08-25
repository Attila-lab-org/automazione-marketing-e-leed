import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { assertNoSecrets, getPublicAiReadiness } from '@/lib/ai/readiness';
import { listRecentAiRuns } from '@/lib/ai/persist';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  const readiness = getPublicAiReadiness(process.env);
  let lastRuns: Awaited<ReturnType<typeof listRecentAiRuns>> = [];
  let persistenceReady = false;

  if (isSupabaseConfigured(process.env) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminSupabaseClient(process.env);
      const workspace = await ensureDefaultWorkspace(admin);
      lastRuns = await listRecentAiRuns(admin, workspace.id, 5);
      persistenceReady = true;
    } catch (err) {
      console.error(
        'AI status persistenza:',
        err instanceof Error ? err.message : 'errore sconosciuto',
      );
    }
  }

  const payload = {
    ...readiness,
    persistenceReady,
    lastRuns,
  };
  assertNoSecrets(payload);
  return NextResponse.json(payload);
});
