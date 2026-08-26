import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { assertNoSecrets, getPublicAiReadiness } from '@/lib/ai/readiness';
import { listRecentAiRuns } from '@/lib/ai/persist';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { getEmailInboundReadiness } from '@/lib/inbound/email';
import { getEmailReplyPathReadiness } from '@/lib/inbound/email-readiness';

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
    services: {
      operatorChat: '/api/ai/operator/chat',
      commercialGoals: '/api/ai/goals',
      commercialInsights: '/api/ai/insights',
      providerStatus: '/api/providers/status',
      emailInbound: '/api/webhooks/inbound/email',
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      emailInboundReadiness: getEmailInboundReadiness(process.env),
      emailReplyPath: getEmailReplyPathReadiness(process.env),
    },
  };
  assertNoSecrets(payload);
  return NextResponse.json(payload);
});
