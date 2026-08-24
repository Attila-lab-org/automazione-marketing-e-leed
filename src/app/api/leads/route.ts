import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { listWorkspaceLeads } from '@/lib/leads/discovery';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase non configurato', leads: [], source: 'unconfigured' },
      { status: 503 },
    );
  }

  const leads = await listWorkspaceLeads(process.env);
  return NextResponse.json({
    leads,
    source: 'supabase',
    count: leads.length,
  });
});
