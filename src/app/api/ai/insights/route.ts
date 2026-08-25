import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getCommercialLearningSnapshot } from '@/lib/sales/learning';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import { getDailyCommercialBriefing } from '@/lib/sales/daily-briefing';

export const runtime = 'nodejs';

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database non configurato' }, { status: 503 });
  }
  const daysRaw = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const windowDays = Number.isFinite(daysRaw) ? Math.min(90, Math.max(7, Math.round(daysRaw))) : 30;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const [insights, briefing] = await Promise.all([
    getCommercialLearningSnapshot(admin, workspace.id, windowDays),
    getDailyCommercialBriefing(admin, workspace.id),
  ]);
  return NextResponse.json({ insights, briefing });
});
