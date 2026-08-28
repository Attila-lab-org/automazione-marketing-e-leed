import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listCommercialAlerts } from '@/lib/sales/commercial-alerts';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const url = new URL(request.url);
  const channelParam = url.searchParams.get('channel');
  const channel = channelParam === 'telegram' ? 'telegram' : 'all';
  const limitRaw = Number(url.searchParams.get('limit') ?? 5);
  const limit = Number.isFinite(limitRaw) ? Math.min(8, Math.max(1, Math.floor(limitRaw))) : 5;

  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const alerts = await listCommercialAlerts(admin, workspace.id, { channel, limit });
  return NextResponse.json({ alerts });
});
