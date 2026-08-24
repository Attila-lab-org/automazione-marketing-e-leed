import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { getDashboardStats } from '@/lib/dashboard/stats';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  const stats = await getDashboardStats(admin, workspace.id);
  return NextResponse.json({ stats });
});
